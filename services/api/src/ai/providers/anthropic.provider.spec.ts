import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiPrompt } from '../interfaces/ai-message.interface.js';

// The SDK is replaced wholesale: these tests cover what this provider sends
// and how it reads the stream, not Anthropic's client.
const sdk = vi.hoisted(() => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}

  const state = {
    events: [] as unknown[],
    streamCalls: [] as { params: Record<string, unknown>; options: unknown }[],
    clientOptions: [] as Record<string, unknown>[],
    listModels: vi.fn(async () => ({ data: [] })),
  };

  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;

    constructor(options: Record<string, unknown>) {
      state.clientOptions.push(options);
    }

    beta = {
      messages: {
        stream: (params: Record<string, unknown>, options: unknown) => {
          state.streamCalls.push({ params, options });
          return (async function* () {
            for (const event of state.events) yield event;
          })();
        },
      },
    };

    models = { list: state.listModels };
  }

  return { Anthropic, AuthenticationError, state };
});

vi.mock('@anthropic-ai/sdk', () => ({ default: sdk.Anthropic }));

const { AnthropicProvider, claudeModelTraits, toFinishReason } =
  await import('./anthropic.provider.js');

const prompt: AiPrompt = {
  systemInstruction: 'SYSTEM RULES',
  messages: [
    { role: 'user', content: 'page context' },
    { role: 'model', content: 'understood' },
    { role: 'user', content: 'What is exported?' },
  ],
  maxOutputTokens: 1024,
  temperature: 0.3,
};

function config(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const text = (value: string) => ({
  type: 'content_block_delta',
  index: 1,
  delta: { type: 'text_delta', text: value },
});

async function run(
  model = 'claude-opus-5-5',
  provider = new AnthropicProvider(config()),
) {
  const chunks = [];
  for await (const chunk of provider.streamAnswer(
    prompt,
    model,
    'sk-ant-test',
  )) {
    chunks.push(chunk);
  }
  return chunks;
}

beforeEach(() => {
  sdk.state.events = [];
  sdk.state.streamCalls = [];
  sdk.state.clientOptions = [];
  sdk.state.listModels.mockReset();
  sdk.state.listModels.mockResolvedValue({ data: [] });
});

describe('AnthropicProvider', () => {
  it('defaults to Opus and reads the server key from the environment', () => {
    const provider = new AnthropicProvider(
      config({ ANTHROPIC_API_KEY: 'sk-ant' }),
    );

    expect(provider.id).toBe('anthropic');
    expect(provider.defaultModel).toBe('claude-opus-5-5');
    expect(provider.hasServerKey).toBe(true);
    expect(new AnthropicProvider(config()).hasServerKey).toBe(false);
  });

  it('honours a configured model list', () => {
    const provider = new AnthropicProvider(
      config({ ANTHROPIC_MODELS: 'claude-sonnet-5-5, claude-haiku-4-5' }),
    );

    expect(provider.models).toEqual(['claude-sonnet-5-5', 'claude-haiku-4-5']);
  });

  it('streams only answer text, skipping thinking, then reports how it ended', async () => {
    sdk.state.events = [
      { type: 'message_start', message: {} },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'hmm' },
      },
      text('Ruritania '),
      text('exports timber.'),
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ];

    expect(await run()).toEqual([
      { type: 'text', text: 'Ruritania ' },
      { type: 'text', text: 'exports timber.' },
      { type: 'finish', reason: 'stop' },
    ]);
  });

  it('keeps the system prompt separate and maps model turns to assistant', async () => {
    await run();

    const { params } = sdk.state.streamCalls[0];
    expect(params.system).toBe('SYSTEM RULES');
    expect(params.messages).toEqual([
      { role: 'user', content: 'page context' },
      { role: 'assistant', content: 'understood' },
      { role: 'user', content: 'What is exported?' },
    ]);
  });

  it('sends effort and the refusal fallback to Opus, but no temperature', async () => {
    await run('claude-opus-5-5');

    const { params } = sdk.state.streamCalls[0];
    expect(params.output_config).toEqual({ effort: 'medium' });
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });

  it('sends temperature but no effort or fallback to Haiku', async () => {
    await run('claude-haiku-4-5');

    const { params } = sdk.state.streamCalls[0];
    expect(params.temperature).toBe(0.3);
    expect(params).not.toHaveProperty('output_config');
    expect(params).not.toHaveProperty('fallbacks');
  });

  it('uses the configured effort level', async () => {
    await run(
      'claude-opus-5-5',
      new AnthropicProvider(config({ ANTHROPIC_EFFORT: 'low' })),
    );

    expect(sdk.state.streamCalls[0].params.output_config).toEqual({
      effort: 'low',
    });
  });

  it('builds a client with the request’s key and passes the abort signal', async () => {
    const controller = new AbortController();
    const provider = new AnthropicProvider(config());

    for await (const _ of provider.streamAnswer(
      prompt,
      'claude-opus-5-5',
      'user-key',
      controller.signal,
    )) {
      void _;
    }

    expect(sdk.state.clientOptions[0]).toMatchObject({ apiKey: 'user-key' });
    expect(sdk.state.streamCalls[0].options).toEqual({
      signal: controller.signal,
    });
  });

  it('reports a truncated answer as length', async () => {
    sdk.state.events = [
      text('Partial'),
      { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
    ];

    expect((await run()).at(-1)).toEqual({ type: 'finish', reason: 'length' });
  });

  describe('validateKey', () => {
    it('accepts a key that can list models', async () => {
      await expect(
        new AnthropicProvider(config()).validateKey('sk-ant'),
      ).resolves.toBeUndefined();
      expect(sdk.state.clientOptions[0]).toMatchObject({
        apiKey: 'sk-ant',
        maxRetries: 0,
      });
    });

    it('rejects a key Anthropic refuses, without echoing it', async () => {
      sdk.state.listModels.mockRejectedValue(
        new sdk.AuthenticationError('invalid x-api-key sk-ant-bad'),
      );

      const failure = new AnthropicProvider(config()).validateKey('sk-ant-bad');

      await expect(failure).rejects.toThrow(BadRequestException);
      await expect(failure).rejects.toThrow(/rejected that API key/);
    });

    it('distinguishes an unreachable API from a bad key', async () => {
      sdk.state.listModels.mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        new AnthropicProvider(config()).validateKey('sk-ant'),
      ).rejects.toThrow(/Could not reach Anthropic/);
    });
  });
});

describe('claudeModelTraits', () => {
  it.each([
    ['claude-opus-5-5', { effort: true, temperature: false, fallback: true }],
    ['claude-sonnet-5-5', { effort: true, temperature: false, fallback: true }],
    ['claude-haiku-4-5', { effort: false, temperature: true, fallback: false }],
    ['claude-opus-4-8', { effort: true, temperature: false, fallback: false }],
    ['claude-sonnet-4-6', { effort: true, temperature: true, fallback: false }],
  ])('%s', (model, traits) => {
    expect(claudeModelTraits(model)).toEqual(traits);
  });
});

describe('toFinishReason', () => {
  it('maps Anthropic stop reasons', () => {
    expect(toFinishReason('end_turn')).toBe('stop');
    expect(toFinishReason('max_tokens')).toBe('length');
    expect(toFinishReason('refusal')).toBe('other');
    expect(toFinishReason(undefined)).toBe('other');
  });
});
