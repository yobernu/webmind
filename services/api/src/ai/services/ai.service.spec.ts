import { describe, expect, it, vi } from 'vitest';

import type { UsersService } from '../../users/services/users.service.js';
import type { CredentialsService } from './credentials.service.js';
import type {
  AiAnswerProvider,
  AnswerChunk,
  EmbeddingProvider,
  FinishReason,
} from '../providers/ai-provider.interface.js';
import { ANSWER_TIMEOUT_MS } from '../constants/prompt.constants.js';
import { ANSWER_SENTINEL, NoAnswerError } from '../utils/answer-stream.js';
import { ProviderTimeoutError } from '../utils/timeout.js';
import { AiService } from './ai.service.js';
import type { ContextAssemblerService } from './context-assembler.service.js';
import type { PromptBuilderService } from './prompt-builder.service.js';

/** A provider stream: text fragments, then how the generation ended. */
async function* textStream(
  chunks: string[],
  finish: FinishReason = 'stop',
): AsyncGenerator<AnswerChunk> {
  for (const chunk of chunks) yield { type: 'text', text: chunk };
  yield { type: 'finish', reason: finish };
}

const request = {
  userId: 'user-1',
  pageId: 'page-1',
  question: 'What is exported?',
  history: [],
  page: {
    url: 'https://example.com/a',
    title: 'A',
    content: 'Timber, mostly.',
  },
};

interface Options {
  geminiConfigured?: boolean;
  openRouterConfigured?: boolean;
  strategy?: string;
  /** What findById returns, i.e. the stored preference. */
  user?: { aiProvider: string | null; aiModel: string | null } | null;
  /** Providers this user has stored their own key for. */
  userKeys?: string[];
}

function createDeps(options: Options = {}) {
  const makeProvider = (
    id: string,
    label: string,
    models: string[],
    isConfigured: boolean,
  ) => ({
    id,
    label,
    models,
    defaultModel: models[0],
    hasServerKey: isConfigured,
    streamAnswer: vi.fn(() =>
      textStream([ANSWER_SENTINEL, 'Timber', '.']),
    ),
  });

  const gemini = makeProvider(
    'gemini',
    'Google Gemini',
    ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
    options.geminiConfigured ?? true,
  );
  const openRouter = makeProvider(
    'openrouter',
    'OpenRouter',
    ['openai/gpt-5.2', 'anthropic/claude-x'],
    options.openRouterConfigured ?? true,
  );

  const embeddingProvider = {
    hasServerKey: options.geminiConfigured ?? true,
    embeddingDimensions: 768,
    embed: vi.fn(),
  };

  const contextAssembler = {
    assemble: vi.fn(async () => ({
      content: 'Timber, mostly.',
      partial: options.strategy === 'retrieved',
      strategy: options.strategy ?? 'whole',
    })),
  };

  const promptBuilder = {
    build: vi.fn(() => ({
      systemInstruction: 'SYSTEM',
      messages: [{ role: 'user' as const, content: 'ctx' }],
      maxOutputTokens: 1024,
      temperature: 0.3,
    })),
  };

  const users = {
    findById: vi.fn(async () =>
      options.user === undefined
        ? { aiProvider: null, aiModel: null }
        : options.user,
    ),
    setAiPreference: vi.fn(async () => undefined),
  };

  const userKeys = new Set(options.userKeys ?? []);
  const serverKeys = new Set(
    [
      (options.geminiConfigured ?? true) && 'gemini',
      (options.openRouterConfigured ?? true) && 'openrouter',
    ].filter((id): id is string => Boolean(id)),
  );

  const credentials = {
    isAvailable: true,
    hasUserKey: vi.fn(async (_userId: string, provider: string) =>
      userKeys.has(provider),
    ),
    resolveCredential: vi.fn(async (_userId: string, provider: string) => {
      if (userKeys.has(provider)) {
        return { apiKey: `user-${provider}-key`, source: 'user' as const };
      }
      if (serverKeys.has(provider)) {
        return { apiKey: `server-${provider}-key`, source: 'server' as const };
      }
      throw new Error(`no key for ${provider}`);
    }),
    markUsed: vi.fn(async () => undefined),
  };

  return {
    gemini,
    openRouter,
    credentials,
    contextAssembler,
    promptBuilder,
    users,
    service: new AiService(
      [gemini, openRouter] as unknown as AiAnswerProvider[],
      embeddingProvider as unknown as EmbeddingProvider,
      contextAssembler as unknown as ContextAssemblerService,
      promptBuilder as unknown as PromptBuilderService,
      users as unknown as UsersService,
      credentials as unknown as CredentialsService,
    ),
  };
}

describe('AiService.status', () => {
  it('lists every provider and marks which are usable', async () => {
    const status = await createDeps({ openRouterConfigured: false }).service.status(
      'user-1',
    );

    expect(status.enabled).toBe(true);
    expect(status.providers.map((p) => [p.id, p.enabled])).toEqual([
      ['gemini', true],
      ['openrouter', false],
    ]);
  });

  it('reports nothing selected when no provider has a key', async () => {
    const status = await createDeps({
      geminiConfigured: false,
      openRouterConfigured: false,
    }).service.status('user-1');

    expect(status.enabled).toBe(false);
    expect(status.selected).toBeNull();
  });

  it('reports retrieval as unavailable when only OpenRouter is configured', async () => {
    // OpenRouter cannot embed, so long pages fall back to truncation. The UI
    // needs to be able to say so.
    const status = await createDeps({ geminiConfigured: false }).service.status(
      'user-1',
    );

    expect(status.enabled).toBe(true);
    expect(status.retrievalAvailable).toBe(false);
  });
});

describe('AiService.resolveFor', () => {
  it('uses the first configured provider when the user has no preference', async () => {
    const { service } = createDeps();
    const resolved = await service.resolveFor('user-1');

    expect(resolved.provider.id).toBe('gemini');
    expect(resolved.model).toBe('gemini-3.8-flash');
  });

  it('honours a stored provider and model', async () => {
    const { service } = createDeps({
      user: { aiProvider: 'openrouter', aiModel: 'anthropic/claude-x' },
    });
    const resolved = await service.resolveFor('user-1');

    expect(resolved.provider.id).toBe('openrouter');
    expect(resolved.model).toBe('anthropic/claude-x');
  });

  it('falls back when the preferred provider lost its key', async () => {
    // A stale preference must not lock someone out of answers entirely.
    const { service } = createDeps({
      openRouterConfigured: false,
      user: { aiProvider: 'openrouter', aiModel: 'openai/gpt-5.2' },
    });
    const resolved = await service.resolveFor('user-1');

    expect(resolved.provider.id).toBe('gemini');
    expect(resolved.model).toBe('gemini-3.8-flash');
  });

  it('ignores a model that does not belong to the chosen provider', async () => {
    const { service } = createDeps({
      user: { aiProvider: 'openrouter', aiModel: 'gemini-3.8-flash' },
    });
    const resolved = await service.resolveFor('user-1');

    expect(resolved.provider.id).toBe('openrouter');
    expect(resolved.model).toBe('openai/gpt-5.2');
  });

  it('throws when nothing is configured', async () => {
    const { service } = createDeps({
      geminiConfigured: false,
      openRouterConfigured: false,
    });

    await expect(service.resolveFor('user-1')).rejects.toThrow(
      /no AI provider is available/i,
    );
  });
});

describe('AiService.setPreference', () => {
  it('stores a valid choice', async () => {
    const { service, users } = createDeps();

    await service.setPreference('user-1', 'openrouter', 'openai/gpt-5.2');

    expect(users.setAiPreference).toHaveBeenCalledWith(
      'user-1',
      'openrouter',
      'openai/gpt-5.2',
    );
  });

  it('rejects a provider with no key rather than storing a dead choice', async () => {
    const { service, users } = createDeps({ openRouterConfigured: false });

    await expect(
      service.setPreference('user-1', 'openrouter'),
    ).rejects.toThrow(/no key on this server/i);
    expect(users.setAiPreference).not.toHaveBeenCalled();
  });

  it('rejects a model the provider does not offer', async () => {
    const { service, users } = createDeps();

    await expect(
      service.setPreference('user-1', 'openrouter', 'no/such-model'),
    ).rejects.toThrow(/model/i);
    expect(users.setAiPreference).not.toHaveBeenCalled();
  });
});

describe('AiService.streamAnswer', () => {
  it('assembles context, builds a prompt, then streams', async () => {
    const { service, contextAssembler, promptBuilder, gemini } = createDeps();

    const chunks: string[] = [];
    for await (const chunk of service.streamAnswer(request)) chunks.push(chunk);

    expect(chunks).toEqual(['Timber', '.']);
    expect(contextAssembler.assemble).toHaveBeenCalledWith({
      userId: 'user-1',
      pageId: 'page-1',
      question: 'What is exported?',
      content: 'Timber, mostly.',
    });
    expect(promptBuilder.build).toHaveBeenCalled();
    expect(gemini.streamAnswer).toHaveBeenCalled();
  });

  it('routes the question to the provider the user chose', async () => {
    const { service, gemini, openRouter } = createDeps({
      user: { aiProvider: 'openrouter', aiModel: 'openai/gpt-5.2' },
    });

    for await (const _ of service.streamAnswer(request)) void _;

    expect(openRouter.streamAnswer).toHaveBeenCalled();
    expect(gemini.streamAnswer).not.toHaveBeenCalled();
  });

  it('passes the chosen model to the provider', async () => {
    const { service, openRouter } = createDeps({
      user: { aiProvider: 'openrouter', aiModel: 'anthropic/claude-x' },
    });

    for await (const _ of service.streamAnswer(request)) void _;

    expect(openRouter.streamAnswer).toHaveBeenCalledWith(
      expect.anything(),
      'anthropic/claude-x',
      'server-openrouter-key',
      // Always bounded by the answer timeout, even with no caller signal.
      expect.any(AbortSignal),
    );
  });

  it('passes the assembled extract, not the raw page body, to the builder', async () => {
    // The point of the assembler is that a large page is narrowed before it
    // reaches the prompt.
    const { service, promptBuilder } = createDeps({ strategy: 'retrieved' });

    for await (const _ of service.streamAnswer(request)) void _;

    const [input] = promptBuilder.build.mock.calls[0] as unknown as [
      { page: { content: string | null; partial: boolean } },
    ];
    expect(input.page.content).toBe('Timber, mostly.');
    expect(input.page.partial).toBe(true);
  });

  it('forwards the abort signal so an abandoned answer stops costing tokens', async () => {
    const { service, gemini } = createDeps();
    const controller = new AbortController();

    for await (const _ of service.streamAnswer(request, controller.signal)) void _;

    // The provider gets a signal combining the caller's with a timeout, so
    // what matters is that the caller hanging up still reaches it.
    const passed = (gemini.streamAnswer.mock.calls[0] as unknown[])[3] as AbortSignal;
    expect(passed.aborted).toBe(false);
    controller.abort();
    expect(passed.aborted).toBe(true);
  });

  it('reports a stalled provider as a timeout rather than a finished answer', async () => {
    const { service, gemini } = createDeps();
    // Stands in for the timeout timer, which fake timers cannot reach.
    const clock = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);

    // A provider that ends its stream quietly once aborted, as some do.
    gemini.streamAnswer.mockImplementation(async function* () {
      yield { type: 'text', text: ANSWER_SENTINEL };
      yield { type: 'text', text: 'partial' };
      clock.abort();
    } as never);

    try {
      await expect(
        (async () => {
          for await (const _ of service.streamAnswer(request)) void _;
        })(),
      ).rejects.toThrow(ProviderTimeoutError);
      expect(timeout).toHaveBeenCalledWith(ANSWER_TIMEOUT_MS);
    } finally {
      timeout.mockRestore();
    }
  });
});

describe('AiService with BYOK', () => {
  it('offers a provider the server has no key for once the user supplies one', async () => {
    const status = await createDeps({
      openRouterConfigured: false,
      userKeys: ['openrouter'],
    }).service.status('user-1');

    const openRouter = status.providers.find((p) => p.id === 'openrouter')!;

    expect(openRouter.enabled).toBe(true);
    expect(openRouter.hasServerKey).toBe(false);
    expect(openRouter.hasUserKey).toBe(true);
  });

  it("prefers the user own key over the server key", async () => {
    const { service } = createDeps({ userKeys: ['gemini'] });

    const resolved = await service.resolveFor('user-1');

    expect(resolved.credential.source).toBe('user');
    expect(resolved.credential.apiKey).toBe('user-gemini-key');
  });

  it('uses the server key when the user has none', async () => {
    const { service } = createDeps();

    const resolved = await service.resolveFor('user-1');

    expect(resolved.credential.source).toBe('server');
    expect(resolved.credential.apiKey).toBe('server-gemini-key');
  });

  it("hands the user key to the provider, not the server key", async () => {
    // The whole feature in one assertion: the key that reaches the vendor is
    // the one the user pasted.
    const { service, gemini } = createDeps({ userKeys: ['gemini'] });

    for await (const _ of service.streamAnswer(request)) void _;

    expect(gemini.streamAnswer).toHaveBeenCalledWith(
      expect.anything(),
      'gemini-3.8-flash',
      'user-gemini-key',
      expect.any(AbortSignal),
    );
  });

  it('reports retrieval as available on a user Gemini key alone', async () => {
    // Embeddings are Gemini-only; a user key is as good as a server one.
    const status = await createDeps({
      geminiConfigured: false,
      userKeys: ['gemini'],
    }).service.status('user-1');

    expect(status.retrievalAvailable).toBe(true);
  });

  it("marks the selection as spending the user own quota", async () => {
    const status = await createDeps({ userKeys: ['gemini'] }).service.status(
      'user-1',
    );

    expect(status.selected?.usingUserKey).toBe(true);
  });

  it('records that a stored key was used', async () => {
    const { service, credentials } = createDeps({ userKeys: ['gemini'] });

    for await (const _ of service.streamAnswer(request)) void _;

    expect(credentials.markUsed).toHaveBeenCalled();
  });
});

describe('AiService output contract', () => {
  it("withholds model reasoning and emits only the answer", async () => {
    const { service, gemini } = createDeps();

    gemini.streamAnswer = vi.fn(() =>
      textStream([
        "Here's a thinking process:\n1. Analyze the user input.\n",
        'The user wants a summary.\n',
        `${ANSWER_SENTINEL}\n`,
        'Ruritania exports timber.',
      ]),
    );

    let text = '';
    for await (const chunk of service.streamAnswer(request)) text += chunk;

    expect(text).toBe('Ruritania exports timber.');
    expect(text).not.toContain('thinking process');
    expect(text).not.toContain(ANSWER_SENTINEL);
  });

  it('passes a model that emits no marker through unchanged', async () => {
    // Never swallow an answer just because the contract was not followed.
    const { service, gemini } = createDeps();

    gemini.streamAnswer = vi.fn(() =>
      textStream(['A plain answer ', 'with no marker.']),
    );

    let text = '';
    for await (const chunk of service.streamAnswer(request)) text += chunk;

    expect(text).toBe('A plain answer with no marker.');
  });

  it('fails rather than showing a preamble that never reached an answer', async () => {
    // The provider reports the cut-off, so this is not inferred from the text.
    const { service, gemini } = createDeps();

    gemini.streamAnswer = vi.fn(() =>
      textStream(
        ["Here's a thinking process:\n1. Analyze the user input.\n"],
        'length',
      ),
    );

    let text = '';
    const drain = async () => {
      for await (const chunk of service.streamAnswer(request)) text += chunk;
    };

    await expect(drain()).rejects.toThrow(NoAnswerError);
    expect(text).toBe('');
  });

  it('keeps an answer that was cut off after the marker', async () => {
    const { service, gemini } = createDeps();

    gemini.streamAnswer = vi.fn(() =>
      textStream([`${ANSWER_SENTINEL}\n`, 'Ruritania exports'], 'length'),
    );

    let text = '';
    for await (const chunk of service.streamAnswer(request)) text += chunk;

    expect(text).toBe('Ruritania exports');
  });
});
