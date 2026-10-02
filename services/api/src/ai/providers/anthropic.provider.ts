import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { redactSecret } from '../../common/crypto/secret-box.js';
import { ANSWER_TIMEOUT_MS, KEY_CHECK_TIMEOUT_MS } from '../constants/prompt.constants.js';
import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type {
  AiAnswerProvider,
  AiProviderId,
  AnswerChunk,
  FinishReason,
} from './ai-provider.interface.js';

const DEFAULT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'];

/**
 * Output ceiling for Claude. Larger than the shared MAX_OUTPUT_TOKENS because
 * the current models always think first and thinking counts against it; the
 * effort level, not this cap, is what keeps an answer short and cheap.
 */
const CLAUDE_MAX_TOKENS = 16_000;

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Server-side refusal fallback: on a policy decline the API re-runs the
 * request on a suitable model inside the same call. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/** What a model accepts, since request shapes differ across generations. */
export function claudeModelTraits(model: string) {
  return {
    // Haiku 4.5 rejects `effort`.
    effort: !model.startsWith('claude-haiku'),
    // The 5.x family and Opus 4.7/4.8 reject non-default sampling parameters.
    temperature: !/^claude-(?:(?:fable|mythos|opus|sonnet)-5|opus-4-[78])/.test(model),
    fallback: FALLBACK_MODELS.has(model),
  };
}

/** Anthropic's stop reasons in the provider-neutral vocabulary. A refusal is
 * neither a natural end nor a truncation. */
export function toFinishReason(raw: string | null | undefined): FinishReason {
  if (raw === 'end_turn' || raw === 'stop_sequence') return 'stop';
  if (raw === 'max_tokens') return 'length';
  return 'other';
}

/**
 * Answers with Anthropic's Claude models through the official SDK.
 *
 * Answers only: Anthropic has no embeddings endpoint, so long-page retrieval
 * stays with Gemini even when Claude is answering.
 */
@Injectable()
export class AnthropicProvider implements AiAnswerProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly serverKey: string;
  private readonly effort: Effort;

  readonly id: AiProviderId = 'anthropic';
  readonly label = 'Anthropic Claude';
  readonly models: readonly string[];

  constructor(configService: ConfigService) {
    this.serverKey = configService.get<string>('ANTHROPIC_API_KEY')?.trim() ?? '';

    const configured = configService
      .get<string>('ANTHROPIC_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;

    // Set explicitly rather than left to the model's default, which differs
    // between Claude models; medium suits grounded Q&A on a single page.
    const effort = configService.get<string>('ANTHROPIC_EFFORT')?.trim() as Effort | undefined;
    this.effort = effort && EFFORTS.includes(effort) ? effort : 'medium';

    if (!this.serverKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set; Claude needs a user-supplied key.');
    }
  }

  get defaultModel(): string {
    return this.models[0];
  }

  get hasServerKey(): boolean {
    return this.serverKey.length > 0;
  }

  /** One client per call: the key differs per request (BYOK). */
  private client(apiKey: string, timeout: number, maxRetries = 2): Anthropic {
    return new Anthropic({ apiKey, timeout, maxRetries });
  }

  async *streamAnswer(
    prompt: AiPrompt,
    model: string,
    apiKey: string,
    signal?: AbortSignal,
  ): AsyncIterable<AnswerChunk> {
    const traits = claudeModelTraits(model);

    // Built loosely and passed once: `fallbacks` is newer than some SDK
    // typings, and the beta header is what makes the server accept it.
    const params: Record<string, unknown> = {
      model,
      max_tokens: CLAUDE_MAX_TOKENS,
      // The system prompt is a separate field built only from trusted
      // constants, so page content can never be promoted into it (SRS §8).
      system: prompt.systemInstruction,
      messages: prompt.messages.map((message) => ({
        role: message.role === 'model' ? 'assistant' : 'user',
        content: message.content,
      })),
      ...(traits.effort ? { output_config: { effort: this.effort } } : {}),
      ...(traits.temperature ? { temperature: prompt.temperature } : {}),
      ...(traits.fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}),
    };

    const stream = this.client(apiKey, ANSWER_TIMEOUT_MS).beta.messages.stream(
      params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
      { signal },
    );

    let stopReason: string | null | undefined;

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        // Thinking arrives as separate `thinking_delta` events and is never
        // forwarded: only the answer text reaches the user.
        yield { type: 'text', text: event.delta.text };
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    if (stopReason === 'refusal') {
      this.logger.warn(`${model} declined to answer a question.`);
    }

    yield { type: 'finish', reason: toFinishReason(stopReason) };
  }

  /** Lists models: authenticated, but spends no tokens. */
  async validateKey(apiKey: string): Promise<void> {
    try {
      await this.client(apiKey, KEY_CHECK_TIMEOUT_MS, 0).models.list();
    } catch (cause) {
      const detail = cause instanceof Error ? redactSecret(cause.message, apiKey) : '';

      if (
        cause instanceof Anthropic.AuthenticationError ||
        cause instanceof Anthropic.PermissionDeniedError
      ) {
        this.logger.warn(`Anthropic rejected a submitted key: ${detail.slice(0, 200)}`);
        throw new BadRequestException(
          'Anthropic rejected that API key. Check it at https://console.anthropic.com/settings/keys',
        );
      }

      this.logger.warn(`Could not validate an Anthropic key: ${detail.slice(0, 200)}`);
      throw new BadRequestException(
        'Could not reach Anthropic to check that key. Try again.',
      );
    }
  }
}
