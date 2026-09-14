import type { AiPrompt } from '../interfaces/ai-message.interface.js';

/** Stable identifiers for the answer providers, used in the API and stored as
 * the user's preference and credential rows. */
export const AI_PROVIDER_IDS = ['gemini', 'openrouter'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return (
    typeof value === 'string' &&
    (AI_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

/** What an embedding is for. Retrieval quality depends on asking for the right
 * one: stored chunks and the question matched against them are embedded
 * differently. */
export type EmbeddingPurpose = 'document' | 'query';

/**
 * Why a generation stopped.
 *
 * `length` means the model was cut off at the output cap rather than choosing
 * to stop — the difference between a short answer and an unfinished one.
 */
export type FinishReason = 'stop' | 'length' | 'other';

/**
 * One event from an answer stream.
 *
 * Providers emit text as it arrives and, unless the caller walks away, exactly
 * one `finish` at the end. Carrying the finish reason as part of the stream is
 * what lets downstream code tell a complete generation from a truncated one
 * using what the vendor reports, rather than inferring it from the prose.
 */
export type AnswerChunk =
  | { type: 'text'; text: string }
  | { type: 'finish'; reason: FinishReason };

/**
 * A vendor that can answer questions.
 *
 * Deliberately separate from EmbeddingProvider: OpenRouter exposes only chat
 * completions and has no embeddings endpoint, so a single combined interface
 * would force it to implement a method it can never honour.
 *
 * The API key is a parameter rather than constructor state, because it differs
 * per request: a user's own key when they have stored one, the server's
 * otherwise.
 */
export interface AiAnswerProvider {
  readonly id: AiProviderId;
  /** Shown in the extension's provider picker. */
  readonly label: string;
  /** Whether the *server* holds a key. Per-user availability also depends on
   * whether that user stored one, which only CredentialsService knows. */
  readonly hasServerKey: boolean;
  /** Models a user may choose, most preferred first. */
  readonly models: readonly string[];
  readonly defaultModel: string;

  /** Yields answer fragments as they arrive, then how the generation ended. */
  streamAnswer(
    prompt: AiPrompt,
    model: string,
    apiKey: string,
    signal?: AbortSignal,
  ): AsyncIterable<AnswerChunk>;

  /**
   * Cheapest possible liveness check on a key, so a typo is caught when it is
   * pasted rather than at the next question. Must not spend tokens. Throws with
   * a user-facing message when the key is rejected.
   */
  validateKey(apiKey: string): Promise<void>;
}

/** A vendor that can turn text into vectors. Only Gemini does this today. */
export interface EmbeddingProvider {
  readonly hasServerKey: boolean;
  /** Must match the vector column's dimensionality. */
  readonly embeddingDimensions: number;

  /** Embeds texts in order; the result is index-aligned with the input. */
  embed(
    texts: string[],
    purpose: EmbeddingPurpose,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<number[][]>;
}

/** Every answer provider, injected as an array. */
export const AI_ANSWER_PROVIDERS = Symbol('AI_ANSWER_PROVIDERS');

/** The provider used for embeddings, regardless of who answers. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
