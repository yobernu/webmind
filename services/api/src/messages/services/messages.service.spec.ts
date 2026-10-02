import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONTEXT_CHARS } from '../../ai/constants/prompt.constants.js';
import type { AiService } from '../../ai/services/ai.service.js';
import { NoAnswerError } from '../../ai/utils/answer-stream.js';
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
    strategy?: string;
    /** Page body long enough that retrieval will be attempted. */
    longPage?: boolean;
    /** Overrides the history replayed into the prompt. */
    recent?: { role: MessageRole; content: string }[];
    /** Simulates the client disconnecting after this many deltas. */
    stopAfter?: number;
    /** Aborted by `stopAfter`, so the service sees a real stopped signal. */
    controller?: AbortController;
  } = {},
) {
  const written: { role: MessageRole; content: string }[] = [];
  // Index-aligned with `written`.
  const writeOptions: ({ incomplete?: boolean; title?: string } | undefined)[] = [];
  let nextId = 1;

  const messages = {
    create: vi.fn(async (
      _conversationId: string,
      role: MessageRole,
      content: string,
      options?: { incomplete?: boolean; title?: string },
    ) => {
      written.push({ role, content });
      writeOptions.push(options);
      return {
        id: `msg-${nextId++}`,
        conversationId: 'conv-1',
        role,
        content,
        createdAt: new Date(),
      };
    }),
    listForConversation: vi.fn(async () => []),
    listRecent: vi.fn(async () =>
      options.recent
        ? options.recent.map((row, index) => ({
            id: `hist-${index}`,
            conversationId: 'conv-1',
            createdAt: new Date(Date.now() + index),
            ...row,
          }))
        : [
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
    ],
    ),
  };

  const conversations = {
    findOwned: vi.fn(async () => {
      if (options.owned === false) throw new NotFoundException('Conversation not found');
      return { ...conversation, title: options.title ?? null };
    }),
  };

  const pages = {
    findOwnedWithContent: vi.fn(async () =>
      options.longPage
        ? { ...page, content: 'x'.repeat(MAX_CONTEXT_CHARS + 1) }
        : page,
    ),
  };

  const ai = {
    isConfiguredFor: vi.fn(async () => options.configured ?? true),
    prepare: vi.fn(
      async (_request: { history: { role: string; content: string }[] }) => ({
        provider: { id: 'gemini' },
        model: 'gemini-test',
        prompt: { systemInstruction: 'SYSTEM', messages: [], maxOutputTokens: 1, temperature: 0 },
        strategy: options.strategy ?? 'whole',
      }),
    ),
    stream: vi.fn(function* (_prepared: unknown, _signal?: AbortSignal) {
      const deltas = options.deltas ?? ['Ruritania ', 'exports timber.'];
      for (const [index, delta] of deltas.entries()) {
        if (options.throwAfter !== undefined && index === options.throwAfter) {
          throw new Error('provider timeout');
        }

        if (options.stopAfter !== undefined && index === options.stopAfter) {
          // What a client disconnect looks like from inside the stream: the
          // signal trips, then the provider call rejects.
          options.controller?.abort();
          throw new Error('This operation was aborted');
        }

        yield delta;
      }
    }),
  };

  return {
    written,
    writeOptions,
    messages,
    conversations,
    pages,
    ai,
    service: new MessagesService(
      messages as unknown as MessagesRepository,
      conversations as unknown as ConversationsService,
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
      { type: 'status', stage: 'reading' },
      { type: 'status', stage: 'thinking' },
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
    expect(deps.writeOptions[1]).toEqual({ incomplete: false });
  });

  it('refuses a user with no usable provider, asking per user', async () => {
    await drain(deps.service.ask('user-1', 'conv-1', 'q'));

    expect(deps.ai.isConfiguredFor).toHaveBeenCalledWith('user-1');
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
      // Kept, but flagged so it is not replayed as a finished answer.
      expect(failing.writeOptions[1]).toEqual({ incomplete: true });
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

    it('tells the user what to change when the model never reached an answer', async () => {
      // A NoAnswerError is the one provider failure worth repeating verbatim:
      // it says what would make the next attempt work.
      const abandoned = createDeps();
      abandoned.ai.stream = vi.fn(function* () {
        throw new NoAnswerError('That model never reached an answer.');
      });

      const events = await drain(abandoned.service.ask('user-1', 'conv-1', 'q'));

      expect(events.at(-1)).toEqual({
        type: 'error',
        message: 'That model never reached an answer. Your question was saved.',
      });
    });
  });

  // Pressing Stop is a normal ending, not an error: the person asking chose it.
  describe('when the caller stops the answer', () => {
    it('keeps the text generated so far and reports nothing', async () => {
      const controller = new AbortController();
      const stopped = createDeps({
        deltas: ['Ruritania ', 'exports timber.'],
        stopAfter: 1,
        controller,
      });

      const events = await drain(
        stopped.service.ask('user-1', 'conv-1', 'q', controller.signal),
      );

      expect(stopped.written[1]).toEqual({
        role: MessageRole.ASSISTANT,
        content: 'Ruritania ',
      });
      // No error and no done: the client is gone, and a stop is not a failure.
      expect(events.some((event) => event.type === 'error')).toBe(false);
      expect(events.some((event) => event.type === 'done')).toBe(false);
    });

    it('does not report a stop before any text as an empty answer', async () => {
      const controller = new AbortController();
      const stopped = createDeps({ stopAfter: 0, controller });

      const events = await drain(
        stopped.service.ask('user-1', 'conv-1', 'q', controller.signal),
      );

      // Only the question; nothing was generated to keep.
      expect(stopped.written).toHaveLength(1);
      expect(events.some((event) => event.type === 'error')).toBe(false);
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

  // The panel shows these as "Reading the page" / "Searching the page" /
  // "Thinking". Each must correspond to work that is actually happening.
  describe('progress stages', () => {
    it('reports reading, then thinking, before any text', async () => {
      const events = await drain(deps.service.ask('user-1', 'conv-1', 'q'));

      const stages = events
        .filter((event) => event.type === 'status')
        .map((event) => (event as { stage: string }).stage);

      expect(stages).toEqual(['reading', 'thinking']);

      const firstDelta = events.findIndex((event) => event.type === 'delta');
      const lastStatus = events.reduce(
        (last, event, index) => (event.type === 'status' ? index : last),
        -1,
      );
      expect(lastStatus).toBeLessThan(firstDelta);
    });

    it('says searching only when the page is large enough to be retrieved from', async () => {
      // Claiming a search on a short page would be describing work that never
      // happens: the assembler passes small pages through whole.
      const long = createDeps({ longPage: true, strategy: 'retrieved' });

      const events = await drain(long.service.ask('user-1', 'conv-1', 'q'));
      const stages = events
        .filter((event) => event.type === 'status')
        .map((event) => (event as { stage: string }).stage);

      expect(stages).toEqual(['searching', 'thinking']);
    });

    it('emits no status once text has started arriving', async () => {
      const events = await drain(deps.service.ask('user-1', 'conv-1', 'q'));
      const firstDelta = events.findIndex((event) => event.type === 'delta');

      expect(
        events.slice(firstDelta).some((event) => event.type === 'status'),
      ).toBe(false);
    });

    it('still reports the phases when the provider then fails', async () => {
      // The stages are not conditional on success; a failure after "thinking"
      // must not leave the panel with no explanation of what it was doing.
      const failing = createDeps({ throwAfter: 0 });

      const events = await drain(failing.service.ask('user-1', 'conv-1', 'q'));

      expect(events[0]).toEqual({ type: 'status', stage: 'reading' });
      expect(events.at(-1)?.type).toBe('error');
    });
  });

  describe('context passed to the model', () => {
    it('sends the page identity and stored text', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

      expect(deps.ai.prepare).toHaveBeenCalledWith(
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
      );
    });

    it('replays prior user and assistant turns but never system rows', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'q'));

      const [request] = deps.ai.prepare.mock.calls[0];
      expect(request.history).toEqual([
        { role: 'user', content: 'earlier question' },
      ]);
    });

    it('reads history from before the new question was stored', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'the new question'));

      const [request] = deps.ai.prepare.mock.calls[0];
      expect(
        request.history.some((turn: { content: string }) =>
          turn.content.includes('the new question'),
        ),
      ).toBe(false);
    });

    it('collapses a question repeated after failed attempts', async () => {
      // Every retry is persisted so the question is never lost (FR-10), so an
      // unanswered question can appear several times in a row. Replaying all
      // of them invites the model to analyse the repetition instead of
      // answering it.
      const repeated = createDeps({
        recent: [
          { role: MessageRole.USER, content: 'why am I seeing these errors' },
          { role: MessageRole.USER, content: 'why am I seeing these errors' },
          { role: MessageRole.USER, content: 'why am I seeing these errors' },
        ],
      });

      await drain(repeated.service.ask('user-1', 'conv-1', 'and now?'));

      const [request] = repeated.ai.prepare.mock.calls[0];
      expect(request.history).toEqual([
        { role: 'user', content: 'why am I seeing these errors' },
      ]);
    });

    it('keeps a repeat that follows an answer, which is a real follow-up', async () => {
      const followUp = createDeps({
        recent: [
          { role: MessageRole.USER, content: 'summarise this' },
          { role: MessageRole.ASSISTANT, content: 'Here is a summary.' },
          { role: MessageRole.USER, content: 'summarise this' },
        ],
      });

      await drain(followUp.service.ask('user-1', 'conv-1', 'and now?'));

      const [request] = followUp.ai.prepare.mock.calls[0];
      expect(request.history).toHaveLength(3);
    });
  });

  describe('conversation bookkeeping', () => {
    it('titles an untitled conversation from its first question', async () => {
      await drain(deps.service.ask('user-1', 'conv-1', 'What is exported?'));

      expect(deps.writeOptions[0]).toEqual({ title: 'What is exported?' });
    });

    it('leaves an existing title alone', async () => {
      const titled = createDeps({ title: 'Existing title' });

      await drain(titled.service.ask('user-1', 'conv-1', 'another question'));

      expect(titled.writeOptions[0]).toEqual({ title: undefined });
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
