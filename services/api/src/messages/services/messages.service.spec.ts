import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiService } from '../../ai/services/ai.service.js';
import type { ConversationsRepository } from '../../conversations/repositories/conversations.repository.js';
import type { ConversationsService } from '../../conversations/services/conversations.service.js';
import { MessageRole } from '../../generated/prisma/enums.js';
import type { PagesService } from '../../pages/services/pages.service.js';
import type { MessagesRepository } from '../repositories/messages.repository.js';
import { MessagesService } from './messages.service.js';

const conversation = {
  id: 'conv-1',
  userId: 'user-1',
  pageId: 'page-1',
  title: null as string | null,
};

const page = {
  id: 'page-1',
  url: 'https://example.com/article',
  title: 'My Article',
  content: 'Ruritania exports mostly timber.',
};

/** Collects everything the service yields. */
async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function createDeps(
  options: {
    deltas?: string[];
    throwAfter?: number;
    configured?: boolean;
    owned?: boolean;
    title?: string | null;
  } = {},
) {
  const written: { role: MessageRole; content: string }[] = [];
  let nextId = 1;

  const messages = {
    create: vi.fn(async (_conversationId: string, role: MessageRole, content: string) => {
      written.push({ role, content });
      return {
        id: `msg-${nextId++}`,
        conversationId: 'conv-1',
        role,
        content,
        createdAt: new Date(),
      };
    }),
    listForConversation: vi.fn(async () => []),
    listRecent: vi.fn(async () => [
      {
        id: 'old-1',
        conversationId: 'conv-1',
        role: MessageRole.USER,
        content: 'earlier question',
        createdAt: new Date(),
      },
      {
        id: 'old-2',
        conversationId: 'conv-1',
        role: MessageRole.SYSTEM,
        content: 'a system note that must not be replayed',
        createdAt: new Date(),
      },
    ]),
  };

  const conversations = {
    findOwned: vi.fn(async () => {
      if (options.owned === false) throw new NotFoundException('Conversation not found');
      return { ...conversation, title: options.title ?? null };
    }),
  };

  const conversationRows = { touch: vi.fn(async () => conversation) };

  const pages = { findOwnedWithContent: vi.fn(async () => page) };

  const ai = {
    isConfigured: options.configured ?? true,
    streamAnswer: vi.fn(async function* (
      _request: { history: { role: string; content: string }[] },
      _signal?: AbortSignal,
    ) {
      const deltas = options.deltas ?? ['Ruritania ', 'exports timber.'];
      for (const [index, delta] of deltas.entries()) {
        if (options.throwAfter !== undefined && index === options.throwAfter) {
          throw new Error('provider timeout');
        }
        yield delta;
      }
    }),
  };

  return {
    written,
    messages,
    conversations,
    conversationRows,
    pages,
    ai,
    service: new MessagesService(
      messages as unknown as MessagesRepository,
      conversations as unknown as ConversationsService,
      conversationRows as unknown as ConversationsRepository,
      pages as unknown as PagesService,
      ai as unknown as AiService,
    ),
  };
}

describe('MessagesService.ask', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it('streams deltas then a done event carrying the stored message', async () => {
    const events = await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

    expect(events).toEqual([
      { type: 'delta', text: 'Ruritania ' },
      { type: 'delta', text: 'exports timber.' },
      { type: 'done', messageId: 'msg-2', content: 'Ruritania exports timber.' },
    ]);
  });

  it('persists the question and the answer with the right roles, in order', async () => {
    await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

    expect(deps.written).toEqual([
      { role: MessageRole.USER, content: 'What is exported?' },
      { role: MessageRole.ASSISTANT, content: 'Ruritania exports timber.' },
    ]);
  });

  // --- FR-10: "AI timeouts and provider errors shall not silently discard the
  //     user's question."
  describe('when the provider fails', () => {
    it('has already stored the question before contacting the provider', async () => {
      const failing = createDeps({ throwAfter: 0 });

      await drain(failing.service.ask('user-1', 'conv-1', 'Will this survive?'));

      expect(failing.written[0]).toEqual({
        role: MessageRole.USER,
        content: 'Will this survive?',
      });
    });

    it('stores the question even when the provider throws immediately', async () => {
      const failing = createDeps({ throwAfter: 0 });

      const events = await drain(
        failing.service.ask('user-1', 'conv-1', 'Will this survive?'),
      );

      expect(events.at(-1)).toEqual({
        type: 'error',
        message: 'The answer could not be completed. Your question was saved.',
      });
      // No empty assistant row.
      expect(failing.written).toHaveLength(1);
    });

    it('keeps a partial answer rather than throwing it away', async () => {
      const failing = createDeps({
        deltas: ['Ruritania ', 'exports ', 'timber.'],
        throwAfter: 2,
      });

      const events = await drain(failing.service.ask('user-1', 'conv-1', 'q'));

      expect(events.filter((event) => event.type === 'delta')).toHaveLength(2);
      expect(failing.written[1]).toEqual({
        role: MessageRole.ASSISTANT,
        content: 'Ruritania exports ',
      });
      expect(events.at(-1)?.type).toBe('error');
    });

    it('reports an empty answer as an error instead of a blank message', async () => {
      const empty = createDeps({ deltas: [] });

      const events = await drain(empty.service.ask('user-1', 'conv-1', 'q'));

      expect(events.at(-1)).toEqual({
        type: 'error',
        message: 'The model returned an empty answer. Your question was saved.',
      });
      expect(empty.written).toHaveLength(1);
    });
  });

  describe('preconditions', () => {
    it('refuses a conversation the user does not own, writing nothing', async () => {
      const foreign = createDeps({ owned: false });

      await expect(
        drain(foreign.service.ask('user-2', 'conv-1', 'q')),
      ).rejects.toThrow(NotFoundException);

      expect(foreign.written).toHaveLength(0);
    });

    it('refuses before writing when AI is not configured', async () => {
      // Otherwise the question would be stranded in a conversation that can
      // never produce an answer.
      const unconfigured = createDeps({ configured: false });

      await expect(
        drain(unconfigured.service.ask('user-1', 'conv-1', 'q')),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(unconfigured.written).toHaveLength(0);
    });
  });

  describe('context passed to the model', () => {
    it('sends the page identity and stored text', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

      expect(deps.ai.streamAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          pageId: 'page-1',
          question: 'What is exported?',
          page: {
            url: page.url,
            title: page.title,
            content: page.content,
          },
        }),
        undefined,
      );
    });

    it('replays prior user and assistant turns but never system rows', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'q'));

      const [request] = deps.ai.streamAnswer.mock.calls[0];
      expect(request.history).toEqual([
        { role: 'user', content: 'earlier question' },
      ]);
    });

    it('reads history from before the new question was stored', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'the new question'));

      const [request] = deps.ai.streamAnswer.mock.calls[0];
      expect(
        request.history.some((turn: { content: string }) =>
          turn.content.includes('the new question'),
        ),
      ).toBe(false);
    });
  });

  describe('conversation bookkeeping', () => {
    it('titles an untitled conversation from its first question', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

      expect(deps.conversationRows.touch).toHaveBeenCalledWith(
        'conv-1',
        'What is exported?',
      );
    });

    it('leaves an existing title alone', async () => {
      const titled = createDeps({ title: 'Existing title' });

      await drain(titled.service.ask('user-1', 'conv-1', 'another question'));

      expect(titled.conversationRows.touch).toHaveBeenCalledWith(
        'conv-1',
        undefined,
      );
    });
  });
});

describe('MessagesService.listForConversation', () => {
  it('refuses another user’s conversation', async () => {
    const foreign = createDeps({ owned: false });

    await expect(
      foreign.service.listForConversation('user-2', 'conv-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
