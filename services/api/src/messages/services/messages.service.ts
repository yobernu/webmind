import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { MAX_HISTORY_MESSAGES } from '../../ai/constants/prompt.constants.js';
import type { AiStreamEvent } from '../../ai/dto/ai-completion.dto.js';
import type { AiMessage } from '../../ai/interfaces/ai-message.interface.js';
import { AiService } from '../../ai/services/ai.service.js';
import {
  ConversationsService,
  titleFromQuestion,
} from '../../conversations/services/conversations.service.js';
import { ConversationsRepository } from '../../conversations/repositories/conversations.repository.js';
import { MessageRole } from '../../generated/prisma/enums.js';
import { PagesService } from '../../pages/services/pages.service.js';
import { toMessageResponse } from '../dto/message-response.dto.js';
import type { MessageEntity } from '../entities/message.entity.js';
import { toAiRole } from '../enums/message-role.enum.js';
import { MessagesRepository } from '../repositories/messages.repository.js';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsService,
    private readonly conversationRows: ConversationsRepository,
    private readonly pages: PagesService,
    private readonly ai: AiService,
  ) {}

  async listForConversation(
    userId: string,
    conversationId: string,
  ): Promise<MessageEntity[]> {
    await this.conversations.findOwned(userId, conversationId);

    const rows = await this.messages.listForConversation(conversationId);

    return rows.map(toMessageResponse);
  }

  /**
   * Asks a question and streams the answer (FR-04).
   *
   * The order of operations is what FR-10 requires: the question is persisted
   * *before* the provider is contacted, so a timeout or provider outage cannot
   * discard it. Whatever text arrived before a failure is persisted too, so a
   * half-finished answer is not lost either.
   */
  async *ask(
    userId: string,
    conversationId: string,
    question: string,
    signal?: AbortSignal,
  ): AsyncIterable<AiStreamEvent> {
    const conversation = await this.conversations.findOwned(
      userId,
      conversationId,
    );

    if (!this.ai.isConfigured) {
      // Raised before anything is written, so the question is not stranded in a
      // conversation that can never be answered.
      throw new ServiceUnavailableException(
        'AI is not configured on this server.',
      );
    }

    const page = await this.pages.findOwnedWithContent(
      userId,
      conversation.pageId,
    );

    // History as it stood before this question.
    const history = await this.historyFor(conversationId);

    await this.messages.create(conversationId, MessageRole.USER, question);

    await this.conversationRows.touch(
      conversationId,
      conversation.title ? undefined : titleFromQuestion(question),
    );

    let answer = '';
    let failure: string | null = null;

    try {
      for await (const delta of this.ai.streamAnswer(
        {
          userId,
          pageId: conversation.pageId,
          question,
          history,
          page: {
            url: page.url,
            title: page.title,
            content: page.content,
          },
        },
        signal,
      )) {
        answer += delta;
        yield { type: 'delta', text: delta };
      }
    } catch (error) {
      failure =
        error instanceof Error ? error.message : 'The AI request failed';
      this.logger.warn(
        `Answer stream failed for conversation ${conversationId}: ${failure}`,
      );
    }

    // Persisted whether the stream completed, failed part-way, or the client
    // went away; an empty answer is not worth a row.
    const stored = answer.trim()
      ? await this.messages.create(
          conversationId,
          MessageRole.ASSISTANT,
          answer,
        )
      : null;

    if (stored) await this.conversationRows.touch(conversationId);

    if (failure) {
      yield {
        type: 'error',
        message: 'The answer could not be completed. Your question was saved.',
      };
      return;
    }

    if (!stored) {
      yield {
        type: 'error',
        message: 'The model returned an empty answer. Your question was saved.',
      };
      return;
    }

    yield { type: 'done', messageId: stored.id, content: answer };
  }

  /** Recent turns as provider-neutral messages, oldest first. */
  private async historyFor(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.messages.listRecent(
      conversationId,
      MAX_HISTORY_MESSAGES,
    );

    return rows.flatMap((row) => {
      const role = toAiRole(row.role);
      return role ? [{ role, content: row.content }] : [];
    });
  }
}
