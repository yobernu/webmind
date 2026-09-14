import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

import { redactSecret } from '../../common/crypto/secret-box.js';
import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type {
  AiAnswerProvider,
  AiProviderId,
  AnswerChunk,
  EmbeddingProvider,
  EmbeddingPurpose,
  FinishReason,
} from './ai-provider.interface.js';

const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Must match the `vector(768)` column in the embeddings table. Changing it
 * needs a migration and a re-embed, so it is not silently configurable.
 */
const EMBEDDING_DIMENSIONS = 768;

/**
 * `gemini-embedding-001` distinguishes the two sides of a retrieval pair, which
 * measurably improves matching over embedding both the same way.
 */
const TASK_TYPES: Record<EmbeddingPurpose, string> = {
  document: 'RETRIEVAL_DOCUMENT',
  query: 'RETRIEVAL_QUERY',
};

/** Google's API caps how many inputs one embed call accepts. */
const EMBED_BATCH_SIZE = 100;

/** Google's vocabulary for why generation stopped. */
function toFinishReason(raw: string): FinishReason {
  if (raw === 'STOP') return 'stop';
  if (raw === 'MAX_TOKENS') return 'length';
  return 'other';
}

/** The only provider that does both jobs; OpenRouter has no embeddings API, so
 * embeddings stay here whoever is answering. */
@Injectable()
export class GeminiProvider implements AiAnswerProvider, EmbeddingProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly serverKey: string;
  private readonly embeddingModel: string;

  readonly id: AiProviderId = 'gemini';
  readonly label = 'Google Gemini';
  readonly models: readonly string[];
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;

  constructor(configService: ConfigService) {
    this.serverKey = configService.get<string>('GEMINI_API_KEY')?.trim() ?? '';

    const configured = configService
      .get<string>('GEMINI_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;
    this.embeddingModel =
      configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_EMBEDDING_MODEL;

    if (!this.serverKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set; Gemini needs a user-supplied key.',
      );
    }
  }

  get defaultModel(): string {
    return this.models[0];
  }

  get hasServerKey(): boolean {
    return this.serverKey.length > 0;
  }

  /**
   * A client per call rather than a cached one.
   *
   * Keys are per-user now, so caching would mean holding other people's
   * decrypted keys in memory between requests. Construction is only local
   * config, so this costs nothing measurable.
   */
  private client(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({ apiKey });
  }

  async *streamAnswer(
    prompt: AiPrompt,
    model: string,
    apiKey: string,
    signal?: AbortSignal,
  ): AsyncIterable<AnswerChunk> {
    const stream = await this.client(apiKey).models.generateContentStream({
      model,
      contents: prompt.messages.map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      config: {
        // Kept out of `contents` on purpose: this is the trusted channel.
        systemInstruction: prompt.systemInstruction,
        temperature: prompt.temperature,
        maxOutputTokens: prompt.maxOutputTokens,
        abortSignal: signal,
      },
    });

    // Only overwritten when Google says something; a stream that ends without
    // saying why is 'other' rather than a guess at 'stop'.
    let finish: FinishReason = 'other';

    for await (const chunk of stream) {
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason) finish = toFinishReason(reason);

      const text = chunk.text;
      if (text) yield { type: 'text', text };
    }

    yield { type: 'finish', reason: finish };
  }

  async embed(
    texts: string[],
    purpose: EmbeddingPurpose,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const client = this.client(apiKey);
    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBED_BATCH_SIZE);

      const response = await client.models.embedContent({
        model: this.embeddingModel,
        contents: batch.map((text) => ({ parts: [{ text }] })),
        config: {
          taskType: TASK_TYPES[purpose],
          outputDimensionality: EMBEDDING_DIMENSIONS,
          abortSignal: signal,
        },
      });

      const embeddings = response.embeddings ?? [];

      if (embeddings.length !== batch.length) {
        throw new Error(
          `Gemini returned ${embeddings.length} embeddings for ${batch.length} inputs`,
        );
      }

      for (const embedding of embeddings) {
        const values = embedding.values;

        if (!values || values.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${values?.length ?? 0}`,
          );
        }

        vectors.push(values);
      }
    }

    return vectors;
  }

  /** Lists models: authenticated, but spends no tokens. */
  async validateKey(apiKey: string): Promise<void> {
    try {
      await this.client(apiKey).models.list();
    } catch (cause) {
      const detail =
        cause instanceof Error ? redactSecret(cause.message, apiKey) : '';

      this.logger.warn(`Gemini rejected a submitted key: ${detail.slice(0, 200)}`);

      throw new BadRequestException(
        'Google rejected that API key. Check it at https://aistudio.google.com/apikey',
      );
    }
  }
}
