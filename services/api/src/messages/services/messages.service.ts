import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import {
  MAX_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGES,
} from '../../ai/constants/prompt.constants.js';
import type { AiStreamEvent } from '../../ai/dto/ai-completion.dto.js';
import type { AiMessage } from '../../ai/interfaces/ai-message.interface.js';
import { AiService } from '../../ai/services/ai.service.js';
import { NoAnswerError } from '../../ai/utils/answer-stream.js';
import { ProviderTimeoutError } from '../../ai/utils/timeout.js';
import {
  ConversationsService,
  titleFromQuestion,
} from '../../conversations/services/conversations.service.js';
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

    // A user with only their own key is configured even when the server has
    // none, so this must be asked per user.
    if (!(await this.ai.isConfiguredFor(userId))) {
      // Raised before anything is written, so the question is not stranded in a
      // conversation that can never be answered.
      throw new ServiceUnavailableException(
        'AI is not configured on this server. Add your own API key to continue.',
      );
    }

    const page = await this.pages.findOwnedWithContent(
      userId,
      conversation.pageId,
    );

    // History as it stood before this question.
    const history = await this.historyFor(conversationId);

    // The question and the conversation's activity stamp are written together.
    await this.messages.create(conversationId, MessageRole.USER, question, {
      title: conversation.title ? undefined : titleFromQuestion(question),
    });

    let answer = '';
    // `log` is for us and may contain provider internals; `userMessage` is set
    // only when there is something actionable to say to the person who asked.
    let failure: { log: string; userMessage?: string } | null = null;

    try {
      // Context assembly first. Whether it will retrieve is decided by the same
      // size threshold the assembler uses, so the stage can be named *before*
      // the work rather than reported after it is already done.
      const willSearch = (page.content?.length ?? 0) > MAX_CONTEXT_CHARS;
      yield { type: 'status', stage: willSearch ? 'searching' : 'reading' };

      const prepared = await this.ai.prepare({
        userId,
        pageId: conversation.pageId,
        question,
        history,
        page: {
          url: page.url,
          title: page.title,
          content: page.content,
        },
      });

      // From here the wait is the provider's, which can be most of it.
      yield { type: 'status', stage: 'thinking' };

      for await (const delta of this.ai.stream(prepared, signal)) {
        answer += delta;
        yield { type: 'delta', text: delta };
      }
    } catch (error) {
      // Stopping is not failing. The abort came from whoever asked, and
      // whatever was generated is persisted below either way, so this is not
      // worth a warning or an error event.
      if (signal?.aborted) {
        this.logger.debug(
          `Answer stopped by the client for conversation ${conversationId}`,
        );
      } else {
        failure = {
          log: error instanceof Error ? error.message : 'The AI request failed',
          userMessage:
            error instanceof NoAnswerError
              ? error.userMessage
              : error instanceof ProviderTimeoutError
                ? 'The AI provider took too long to answer.'
                : undefined,
        };
        this.logger.warn(
          `Answer stream failed for conversation ${conversationId}: ${failure.log}`,
        );
      }
    }

    // Persisted whether the stream completed, failed part-way, or the client
    // went away; an empty answer is not worth a row.
    const stored = answer.trim()
      ? await this.messages.create(
          conversationId,
          MessageRole.ASSISTANT,
          answer,
          { incomplete: failure !== null || Boolean(signal?.aborted) },
        )
      : null;

    // Nothing to report to a caller who asked us to stop. Reaching this with
    // no text is the normal case when Stop is pressed before the answer
    // begins, and "the model returned an empty answer" would be a lie.
    if (signal?.aborted) return;

    if (failure) {
      yield {
        type: 'error',
        // Provider errors stay generic: they can carry internals, and there is
        // nothing the person who asked could do with them. A NoAnswerError is
        // the opposite — it exists to tell them what to change.
        message: failure.userMessage
          ? `${failure.userMessage} Your question was saved.`
          : 'The answer could not be completed. Your question was saved.',
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

  /**
   * Recent turns as provider-neutral messages, oldest first.
   *
   * Consecutive identical questions are collapsed. They accumulate when a
   * question is retried after a failure — each attempt is persisted so it is
   * never lost — and replaying four copies invites the model to reason about
   * the repetition instead of answering.
   */
  private async historyFor(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.messages.listRecent(
      conversationId,
      MAX_HISTORY_MESSAGES,
    );

    const history: AiMessage[] = [];

    for (const row of rows) {
      const role = toAiRole(row.role);
      if (!role) continue;

      const previous = history.at(-1);
      const isRepeat =
        previous?.role === role &&
        role === 'user' &&
        previous.content === row.content;

      if (isRepeat) continue;

      history.push({ role, content: row.content });
    }

    return history;
  }
}
