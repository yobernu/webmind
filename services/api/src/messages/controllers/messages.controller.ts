import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { UserThrottlerGuard } from '../../common/guards/throttler.guard.js';
import { CreateMessageDto } from '../dto/create-message.dto.js';
import { MessagesService } from '../services/messages.service.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Lets a previous conversation be reopened with its history (FR-05). */
  @Get(':id/messages')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messages.listForConversation(user.id, conversationId);
  }

  /**
   * Submits a question and streams the answer as server-sent events.
   *
   * The response is written directly rather than through Nest's `@Sse()`
   * helper, because this needs to flush each delta as it arrives and to keep
   * emitting in-band `error` events after the status line has already been
   * sent.
   */
  @Post(':id/messages')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ ai: { limit: 30, ttl: 3_600_000 } })
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    // If the client hangs up, stop generating: an abandoned answer still costs
    // tokens.
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    const stream = this.messages.ask(
      user.id,
      conversationId,
      dto.content,
      controller.signal,
    );

    // The first event has to be preceded by headers; anything that can fail
    // before generation starts (ownership, AI not configured) therefore throws
    // out of `ask()` before we touch the response, and the normal exception
    // filter handles it.
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx and friends buffering the stream into one lump.
      'X-Accel-Buffering': 'no',
    });

    const write = (data: unknown) => {
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (!first.done) write(first.value);

    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      write(next.value);
    }

    response.end();
  }
}
