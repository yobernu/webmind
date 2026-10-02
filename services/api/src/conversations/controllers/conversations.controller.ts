import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { CreateConversationDto } from '../dto/create-conversation.dto.js';
import { ListConversationsQueryDto } from '../dto/list-conversations-query.dto.js';
import { ConversationsService } from '../services/conversations.service.js';

/** Routes named exactly as SRS §6 specifies them. */
@Controller()
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('pages/:id/conversations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversations.create(user.id, pageId, dto.title);
  }

  @Get('pages/:id/conversations')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversations.listForPage(user.id, pageId, query.limit);
  }
}
