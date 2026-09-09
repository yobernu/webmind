import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

import type { AiPrompt } from '../interfaces/ai-message.interface.js';
import type {
  AiAnswerProvider,
  AiProviderId,
  EmbeddingProvider,
  EmbeddingPurpose,
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

/** The only provider that does both jobs; OpenRouter has no embeddings API, so
 * embeddings stay here whoever is answering. */
@Injectable()
export class GeminiProvider implements AiAnswerProvider, EmbeddingProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;
  private readonly embeddingModel: string;

  readonly id: AiProviderId = 'gemini';
  readonly label = 'Google Gemini';
  readonly models: readonly string[];
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('GEMINI_API_KEY')?.trim() ?? '';

    const configured = configService
      .get<string>('GEMINI_MODELS')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean);

    this.models = configured?.length ? configured : DEFAULT_MODELS;
    this.embeddingModel =
      configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_EMBEDDING_MODEL;

    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;

    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY is not set; Gemini is unavailable.');
    }
  }

  get defaultModel(): string {
    return this.models[0];
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  private require(): GoogleGenAI {
    if (!this.client) {
      throw new ServiceUnavailableException('Gemini is not configured.');
    }

    return this.client;
  }

  async *streamAnswer(
    prompt: AiPrompt,
    model: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const client = this.require();

    const stream = await client.models.generateContentStream({
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

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  async embed(
    texts: string[],
    purpose: EmbeddingPurpose,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    const client = this.require();
    if (texts.length === 0) return [];

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
}
