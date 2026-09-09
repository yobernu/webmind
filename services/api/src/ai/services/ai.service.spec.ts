import { describe, expect, it, vi } from 'vitest';

import type { UsersService } from '../../users/services/users.service.js';
import type {
  AiAnswerProvider,
  EmbeddingProvider,
} from '../providers/ai-provider.interface.js';
import { AiService } from './ai.service.js';
import type { ContextAssemblerService } from './context-assembler.service.js';
import type { PromptBuilderService } from './prompt-builder.service.js';

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
    isConfigured,
    streamAnswer: vi.fn(async function* () {
      yield 'Timber';
      yield '.';
    }),
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
    isConfigured: options.geminiConfigured ?? true,
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

  return {
    gemini,
    openRouter,
    contextAssembler,
    promptBuilder,
    users,
    service: new AiService(
      [gemini, openRouter] as unknown as AiAnswerProvider[],
      embeddingProvider as unknown as EmbeddingProvider,
      contextAssembler as unknown as ContextAssemblerService,
      promptBuilder as unknown as PromptBuilderService,
      users as unknown as UsersService,
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
      /not configured/i,
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
    ).rejects.toThrow(/not configured/i);
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
      undefined,
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

    expect(gemini.streamAnswer).toHaveBeenCalledWith(
      expect.anything(),
      'gemini-3.8-flash',
      controller.signal,
    );
  });
});
