import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type { FinishReason } from './ai-provider.interface.js';
import { OpenRouterProvider } from './openrouter.provider.js';

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
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Builds a Response whose body streams the given raw SSE text in fragments,
 * so buffering across reads is exercised rather than assumed. */
function sseResponse(raw: string, fragmentSize = 12): Response {
  const bytes = new TextEncoder().encode(raw);
  let offset = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + fragmentSize));
      offset += fragmentSize;
    },
  });

  return new Response(body, { status: 200 });
}

const chunk = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

/** The answer text only; `finishOf` covers the trailing finish event. */
async function collect(provider: OpenRouterProvider): Promise<string> {
  let out = '';
  for await (const event of provider.streamAnswer(
    prompt,
    'openai/gpt-5.2',
    'sk-test',
  )) {
    if (event.type === 'text') out += event.text;
  }
  return out;
}

async function finishOf(
  provider: OpenRouterProvider,
): Promise<FinishReason | undefined> {
  let reason: FinishReason | undefined;
  for await (const event of provider.streamAnswer(
    prompt,
    'openai/gpt-5.2',
    'sk-test',
  )) {
    if (event.type === 'finish') reason = event.reason;
  }
  return reason;
}

const configured = () =>
  new OpenRouterProvider(config({ OPENROUTER_API_KEY: 'sk-test' }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenRouterProvider configuration', () => {
  it('is unavailable without a key rather than throwing at construction', () => {
    expect(new OpenRouterProvider(config()).hasServerKey).toBe(false);
  });

  it('offers the configured models, first as default', () => {
    const provider = new OpenRouterProvider(
      config({
        OPENROUTER_API_KEY: 'sk-test',
        OPENROUTER_MODELS: ' anthropic/claude-x , openai/gpt-5.2 ',
      }),
    );

    expect(provider.models).toEqual(['anthropic/claude-x', 'openai/gpt-5.2']);
    expect(provider.defaultModel).toBe('anthropic/claude-x');
  });

  it('answers with a caller-supplied key even when the server has none', async () => {
    // The point of BYOK: no server key does not mean the provider is unusable.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`${chunk('ok')}data: [DONE]\n\n`),
    );

    const provider = new OpenRouterProvider(config());

    expect(provider.hasServerKey).toBe(false);
    expect(await collect(provider)).toBe('ok');
  });

  it('sends the key it was handed, not the server default', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(`${chunk('ok')}data: [DONE]\n\n`));

    const provider = new OpenRouterProvider(
      config({ OPENROUTER_API_KEY: 'sk-server' }),
    );

    for await (const _ of provider.streamAnswer(
      prompt,
      'openai/gpt-5.2',
      'sk-the-users-own',
    )) {
      void _;
    }

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer sk-the-users-own');
    expect(headers.Authorization).not.toContain('sk-server');
  });
});

describe('OpenRouterProvider.validateKey', () => {
  it('accepts a key the metadata endpoint recognises', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

    await expect(configured().validateKey('sk-user')).resolves.toBeUndefined();

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/key');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-user',
    );
  });

  it('rejects a key the provider refuses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );

    await expect(configured().validateKey('sk-bad')).rejects.toThrow(
      /rejected that API key/i,
    );
  });

  it('does not leak the key into the error when the network fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('connect ECONNREFUSED using sk-secret-value'),
    );

    await expect(
      configured().validateKey('sk-secret-value'),
    ).rejects.toThrow(/Could not reach OpenRouter/);
  });
});

describe('OpenRouterProvider streaming', () => {
  it('yields the incremental text of each chunk', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`${chunk('Timber')}${chunk(', mostly.')}data: [DONE]\n\n`),
    );

    expect(await collect(configured())).toBe('Timber, mostly.');
  });

  it('skips the keep-alive comments OpenRouter interleaves', async () => {
    // ": OPENROUTER PROCESSING" is an SSE comment. Handing it to JSON.parse
    // is the documented way to crash a naive client.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(
        `: OPENROUTER PROCESSING\n\n${chunk('Tim')}: OPENROUTER PROCESSING\n\n${chunk('ber')}data: [DONE]\n\n`,
      ),
    );

    expect(await collect(configured())).toBe('Timber');
  });

  it('stops at [DONE] and does not parse it as JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`${chunk('done')}data: [DONE]\n\n${chunk('after')}`),
    );

    expect(await collect(configured())).toBe('done');
  });

  it('reassembles events split across read boundaries', async () => {
    // One byte at a time: every event arrives in pieces.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`${chunk('Hello ')}${chunk('world')}data: [DONE]\n\n`, 1),
    );

    expect(await collect(configured())).toBe('Hello world');
  });

  it('tolerates an unparsable chunk instead of losing the answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`${chunk('Good')}data: {not json}\n\n${chunk(' part')}data: [DONE]\n\n`),
    );

    expect(await collect(configured())).toBe('Good part');
  });

  it('surfaces an error delivered inside the stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(
        `${chunk('partial')}data: ${JSON.stringify({ error: { message: 'rate limited' } })}\n\n`,
      ),
    );

    await expect(collect(configured())).rejects.toThrow(/rate limited/);
  });

  it('reports a failed HTTP status with the body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('no credits', { status: 402 }),
    );

    await expect(collect(configured())).rejects.toThrow(/402.*no credits/s);
  });
});

describe('OpenRouterProvider request shape', () => {
  it('sends the system instruction as the first message and maps model turns', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(`${chunk('ok')}data: [DONE]\n\n`));

    await collect(configured());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.model).toBe('openai/gpt-5.2');
    expect(body.stream).toBe(true);
    // A reasoning model's scratchpad must not come back as the answer.
    expect(body.reasoning).toEqual({ exclude: true });
    // Trusted instructions lead, and page content stays in a later user turn.
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'SYSTEM RULES',
    });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
  });

  it('omits attribution headers when they are not configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(`${chunk('ok')}data: [DONE]\n\n`));

    await collect(configured());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['HTTP-Referer']).toBeUndefined();
  });

  it('sends attribution headers when configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(sseResponse(`${chunk('ok')}data: [DONE]\n\n`));

    const provider = new OpenRouterProvider(
      config({
        OPENROUTER_API_KEY: 'sk-test',
        OPENROUTER_SITE_URL: 'https://webmind.example',
        OPENROUTER_SITE_NAME: 'WebMind',
      }),
    );

    for await (const _ of provider.streamAnswer(prompt, 'openai/gpt-5.2', 'sk-test')) void _;

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers['HTTP-Referer']).toBe('https://webmind.example');
    expect(headers['X-OpenRouter-Title']).toBe('WebMind');
  });
});

describe('OpenRouterProvider finish reason', () => {
  /** Builds the chunk that carries the reason, as OpenRouter sends it. */
  const finishChunk = (reason: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`;

  it('reports a completed generation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(
        [chunk('Timber.'), finishChunk('stop'), 'data: [DONE]\n\n'].join(''),
      ),
    );

    expect(await finishOf(configured())).toBe('stop');
  });

  it('reports a generation cut off at the output cap', async () => {
    // What the answer filter relies on to tell an unfinished preamble from a
    // short reply.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(
        [chunk('Thinking'), finishChunk('length'), 'data: [DONE]\n\n'].join(''),
      ),
    );

    expect(await finishOf(configured())).toBe('length');
  });

  it("does not guess when the vendor gives a reason it doesn't know", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(
        [
          chunk('Timber.'),
          finishChunk('content_filter'),
          'data: [DONE]\n\n',
        ].join(''),
      ),
    );

    expect(await finishOf(configured())).toBe('other');
  });

  it('reports a stream that ends without saying why', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(chunk('Timber.')),
    );

    expect(await finishOf(configured())).toBe('other');
  });
});
