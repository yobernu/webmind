import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { UserThrottlerGuard } from '../../common/guards/throttler.guard.js';
import { CreateMessageDto } from '../dto/create-message.dto.js';
import { MessagesService } from '../services/messages.service.js';

@Controller('conversations')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

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
  @SkipThrottle({ auth: true })
  @Throttle({ ai: { limit: 30, ttl: 3_600_000 } })
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    // If the client hangs up, stop generating: an abandoned answer still costs
    // tokens.
    //
    // This must hang off the *response*, not the request. Since Node 16,
    // `IncomingMessage`'s 'close' fires when the request completes — a few
    // milliseconds after the POST body is read — so aborting on it cancelled
    // every answer while the caller was still waiting. `writableEnded`
    // distinguishes a real disconnect from a response that finished normally.
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });

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

    // Past this point the status line is sent, so a failure can no longer go
    // through the exception filter (it would try to send headers again). It is
    // reported in-band instead, and the stream is always ended.
    try {
      if (!first.done) write(first.value);

      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        write(next.value);
      }
    } catch (error) {
      this.logger.error(
        `Answer stream for conversation ${conversationId} failed after it started: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (!response.writableEnded && !controller.signal.aborted) {
        write({
          type: 'error',
          message: 'The answer could not be completed. Your question was saved.',
        });
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }
}
