import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { redactSecret } from '../../common/crypto/secret-box.js';
import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type {
  AiAnswerProvider,
  AiProviderId,
  AnswerChunk,
  FinishReason,
} from './ai-provider.interface.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_MODELS = ['openai/gpt-5.2'];

/** Shape of one streamed chunk; OpenRouter mirrors the OpenAI chat schema. */
interface OpenRouterChunk {
  choices?: {
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
}

/** OpenAI's vocabulary; anything unrecognised is not worth guessing about. */
function toFinishReason(raw: string): FinishReason {
  if (raw === 'stop') return 'stop';
  if (raw === 'length') return 'length';
  return 'other';
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
  private readonly serverKey: string;
  private readonly referer: string | undefined;
  private readonly title: string | undefined;

  readonly id: AiProviderId = 'openrouter';
  readonly label = 'OpenRouter';
  readonly models: readonly string[];

  constructor(configService: ConfigService) {
    this.serverKey = configService.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';

    const configured = configService
      .get<string>('OPENROUTER_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;

    // Optional attribution headers; OpenRouter uses them for its rankings.
    this.referer = configService.get<string>('OPENROUTER_SITE_URL')?.trim() || undefined;
    this.title = configService.get<string>('OPENROUTER_SITE_NAME')?.trim() || undefined;

    if (!this.serverKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not set; OpenRouter needs a user-supplied key.',
      );
    }
  }

  get defaultModel(): string {
    return this.models[0];
  }

  get hasServerKey(): boolean {
    return this.serverKey.length > 0;
  }

  async *streamAnswer(
    prompt: AiPrompt,
    model: string,
    apiKey: string,
    signal?: AbortSignal,
  ): AsyncIterable<AnswerChunk> {

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(this.referer ? { 'HTTP-Referer': this.referer } : {}),
        ...(this.title ? { 'X-OpenRouter-Title': this.title } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: prompt.maxOutputTokens,
        temperature: prompt.temperature,
        // Reasoning models may still think, but their scratchpad must not come
        // back as the answer. Properly integrated ones return it in
        // `delta.reasoning_details`, which this client ignores; this asks for
        // it to be withheld entirely.
        reasoning: { exclude: true },
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
   * Reads the key's own metadata. Authenticated, spends nothing, and doubles as
   * a credit check — a key with no balance is technically valid but useless.
   */
  async validateKey(apiKey: string): Promise<void> {
    let response: Response;

    try {
      response = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (cause) {
      const detail =
        cause instanceof Error ? redactSecret(cause.message, apiKey) : '';
      this.logger.warn(`Could not reach OpenRouter to validate a key: ${detail}`);

      throw new BadRequestException(
        'Could not reach OpenRouter to check that key. Try again.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        response.status === 401
          ? 'OpenRouter rejected that API key. Check it at https://openrouter.ai/keys'
          : `OpenRouter could not verify that key (status ${response.status}).`,
      );
    }
  }

  /**
   * Parses the SSE body.
   *
   * Two framing details bite here: OpenRouter emits `: OPENROUTER PROCESSING`
   * keep-alive comments that must be skipped rather than parsed as JSON, and
   * the stream terminates with a literal `data: [DONE]` that is not JSON either.
   *
   * The finish reason arrives on a chunk before `[DONE]`, so it is carried out
   * and emitted last. A caller that walks away mid-stream gets no `finish`
   * event, which is correct: nothing finished.
   */
  private async *readStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<AnswerChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // Only overwritten when the vendor says something; a stream that ends
    // without saying why is 'other' rather than a guess at 'stop'.
    let finish: FinishReason = 'other';
    let ended = false;

    try {
      while (!ended && !signal?.aborted) {
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
            if (payload === '[DONE]') {
              ended = true;
              break;
            }

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

            const choice = chunk.choices?.[0];
            if (choice?.finish_reason) {
              finish = toFinishReason(choice.finish_reason);
            }

            const text = choice?.delta?.content;
            if (text) yield { type: 'text', text };
          }

          if (ended) break;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    yield { type: 'finish', reason: finish };
  }
}
