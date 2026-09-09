import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type {
  AiAnswerProvider,
  AiProviderId,
} from './ai-provider.interface.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_MODELS = ['openai/gpt-5.2'];

/** Shape of one streamed chunk; OpenRouter mirrors the OpenAI chat schema. */
interface OpenRouterChunk {
  choices?: { delta?: { content?: string | null } }[];
  error?: { message?: string };
}

/**
 * Answers via OpenRouter, which fronts many vendors behind one OpenAI-shaped
 * endpoint. There is no SDK here on purpose: the API is a single POST, and the
 * only subtlety is the SSE framing, handled below.
 *
 * OpenRouter has no embeddings endpoint, so this implements AiAnswerProvider
 * only — embeddings stay with Gemini even when OpenRouter is answering.
 */
@Injectable()
export class OpenRouterProvider implements AiAnswerProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  private readonly apiKey: string;
  private readonly referer: string | undefined;
  private readonly title: string | undefined;

  readonly id: AiProviderId = 'openrouter';
  readonly label = 'OpenRouter';
  readonly models: readonly string[];

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';

    const configured = configService
      .get<string>('OPENROUTER_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;

    // Optional attribution headers; OpenRouter uses them for its rankings.
    this.referer = configService.get<string>('OPENROUTER_SITE_URL')?.trim() || undefined;
    this.title = configService.get<string>('OPENROUTER_SITE_NAME')?.trim() || undefined;

    if (!this.apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not set; OpenRouter is unavailable.',
      );
    }
  }

  get defaultModel(): string {
    return this.models[0];
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async *streamAnswer(
    prompt: AiPrompt,
    model: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('OpenRouter is not configured.');
    }

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.referer ? { 'HTTP-Referer': this.referer } : {}),
        ...(this.title ? { 'X-OpenRouter-Title': this.title } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: prompt.maxOutputTokens,
        temperature: prompt.temperature,
        // The system instruction is a `system` turn here rather than a separate
        // field, but it is still built only from trusted constants and is the
        // first message, so page content cannot displace it.
        messages: [
          { role: 'system', content: prompt.systemInstruction },
          ...prompt.messages.map((message) => ({
            // OpenAI-shaped APIs call the model's turns "assistant".
            role: message.role === 'model' ? 'assistant' : 'user',
            content: message.content,
          })),
        ],
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `OpenRouter request failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }

    yield* this.readStream(response.body, signal);
  }

  /**
   * Parses the SSE body.
   *
   * Two framing details bite here: OpenRouter emits `: OPENROUTER PROCESSING`
   * keep-alive comments that must be skipped rather than parsed as JSON, and
   * the stream terminates with a literal `data: [DONE]` that is not JSON either.
   */
  private async *readStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Events are separated by a blank line; anything after the last one is
        // a partial event and stays in the buffer.
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');

          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();

            // SSE comment (the keep-alive) or a field we do not use.
            if (trimmed.length === 0 || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') return;

            let chunk: OpenRouterChunk;
            try {
              chunk = JSON.parse(payload) as OpenRouterChunk;
            } catch {
              // A malformed chunk is not worth aborting a good answer over.
              this.logger.debug(`Skipping unparsable chunk: ${payload.slice(0, 120)}`);
              continue;
            }

            if (chunk.error?.message) {
              throw new Error(`OpenRouter error: ${chunk.error.message}`);
            }

            const text = chunk.choices?.[0]?.delta?.content;
            if (text) yield text;
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}
