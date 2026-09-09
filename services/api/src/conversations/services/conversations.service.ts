import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import { PagesService } from '../../pages/services/pages.service.js';
import { toConversationResponse } from '../dto/conversation-response.dto.js';
import { MAX_TITLE_LENGTH } from '../dto/create-conversation.dto.js';
import type { ConversationEntity } from '../entities/conversation.entity.js';
import { ConversationsRepository } from '../repositories/conversations.repository.js';

/** Derives a conversation title from its first question, rather than spending a
 * model call on it. */
export function titleFromQuestion(question: string): string {
  const collapsed = question.replace(/\s+/g, ' ').trim();

  return collapsed.length <= MAX_TITLE_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly pages: PagesService,
  ) {}

  /** FR-05: a page may have many conversations. */
  async create(
    userId: string,
    pageId: string,
    title?: string,
  ): Promise<ConversationEntity> {
    // Throws 404 unless the page belongs to this user.
    await this.pages.findOwned(userId, pageId);

    const conversation = await this.conversations.create(
      userId,
      pageId,
      title?.trim() || null,
    );

    return toConversationResponse(conversation, 0);
  }

  async listForPage(
    userId: string,
    pageId: string,
    limit?: number,
  ): Promise<ConversationEntity[]> {
    await this.pages.findOwned(userId, pageId);

    const rows = await this.conversations.listForPage(userId, pageId, limit);

    return rows.map((row) => toConversationResponse(row, row._count.messages));
  }

  /** The conversation a question should join when the client did not name one:
   * the page's most recent, or a fresh one. */
  async resolveForPage(userId: string, pageId: string, question: string) {
    await this.pages.findOwned(userId, pageId);

    const latest = await this.conversations.findLatestForPage(userId, pageId);
    if (latest) return latest;

    return this.conversations.create(
      userId,
      pageId,
      titleFromQuestion(question),
    );
  }

  async findOwned(userId: string, conversationId: string) {
    return assertOwned(
      await this.conversations.findOwned(userId, conversationId),
      'Conversation',
    );
  }
}
