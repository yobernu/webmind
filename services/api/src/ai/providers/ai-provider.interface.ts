import type { AiPrompt } from '../interfaces/ai-message.interface.js';

/** Stable identifiers for the answer providers, used in the API and stored as
 * the user's preference. */
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
 * A vendor that can answer questions.
 *
 * Deliberately separate from EmbeddingProvider: OpenRouter exposes only chat
 * completions and has no embeddings endpoint, so a single combined interface
 * would force it to implement a method it can never honour.
 */
export interface AiAnswerProvider {
  readonly id: AiProviderId;
  /** Shown in the extension's provider picker. */
  readonly label: string;
  /** False when no credential is configured; callers must degrade, not throw. */
  readonly isConfigured: boolean;
  /** Models a user may choose, most preferred first. */
  readonly models: readonly string[];
  readonly defaultModel: string;

  /** Yields answer fragments as they arrive. */
  streamAnswer(
    prompt: AiPrompt,
    model: string,
    signal?: AbortSignal,
  ): AsyncIterable<string>;
}

/** A vendor that can turn text into vectors. Only Gemini does this today. */
export interface EmbeddingProvider {
  readonly isConfigured: boolean;
  /** Must match the vector column's dimensionality. */
  readonly embeddingDimensions: number;

  /** Embeds texts in order; the result is index-aligned with the input. */
  embed(
    texts: string[],
    purpose: EmbeddingPurpose,
    signal?: AbortSignal,
  ): Promise<number[][]>;
}

/** Every answer provider, injected as an array. */
export const AI_ANSWER_PROVIDERS = Symbol('AI_ANSWER_PROVIDERS');

/** The provider used for embeddings, regardless of who answers. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
