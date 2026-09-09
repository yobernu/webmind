import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { UsersService } from '../../users/services/users.service.js';
import type {
  AiProviderSummary,
  AiStatusResponse,
} from '../dto/ai-completion.dto.js';
import type { AiMessage } from '../interfaces/ai-message.interface.js';
import {
  AI_ANSWER_PROVIDERS,
  EMBEDDING_PROVIDER,
  isAiProviderId,
  type AiAnswerProvider,
  type AiProviderId,
  type EmbeddingProvider,
} from '../providers/ai-provider.interface.js';
import { ContextAssemblerService } from './context-assembler.service.js';
import { PromptBuilderService } from './prompt-builder.service.js';

export interface AnswerRequest {
  userId: string;
  pageId: string;
  question: string;
  /** Prior turns of this conversation, oldest first. */
  history: AiMessage[];
  page: {
    url: string;
    title: string | null;
    content: string | null;
  };
}

/** The provider and model a given request will actually use. */
export interface ResolvedProvider {
  provider: AiAnswerProvider;
  model: string;
}

@Injectable()
export class AiService {
  constructor(
    @Inject(AI_ANSWER_PROVIDERS)
    private readonly providers: AiAnswerProvider[],
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly contextAssembler: ContextAssemblerService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly users: UsersService,
  ) {}

  /** Providers with a credential configured, in declaration order. */
  private get available(): AiAnswerProvider[] {
    return this.providers.filter((provider) => provider.isConfigured);
  }

  get isConfigured(): boolean {
    return this.available.length > 0;
  }

  async status(userId: string): Promise<AiStatusResponse> {
    const resolved = await this.resolveFor(userId).catch(() => null);

    const providers: AiProviderSummary[] = this.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.isConfigured,
      models: [...provider.models],
      defaultModel: provider.defaultModel,
    }));

    return {
      enabled: this.isConfigured,
      providers,
      selected: resolved
        ? { provider: resolved.provider.id, model: resolved.model }
        : null,
      retrievalAvailable: this.embeddingProvider.isConfigured,
    };
  }

  /**
   * Applies the user's stored preference, falling back rather than failing:
   * a preference naming a provider that is no longer configured (key removed,
   * provider dropped from the build) resolves to the first available one, so an
   * old preference cannot lock someone out of answers.
   */
  async resolveFor(userId: string): Promise<ResolvedProvider> {
    const available = this.available;

    if (available.length === 0) {
      throw new ServiceUnavailableException(
        'AI is not configured on this server.',
      );
    }

    const user = await this.users.findById(userId);

    const preferred =
      user?.aiProvider && isAiProviderId(user.aiProvider)
        ? available.find((provider) => provider.id === user.aiProvider)
        : undefined;

    const provider = preferred ?? available[0];

    // The stored model only applies to the provider it was chosen for.
    const model =
      preferred && user?.aiModel && provider.models.includes(user.aiModel)
        ? user.aiModel
        : provider.defaultModel;

    return { provider, model };
  }

  /** Validates and stores a preference, then reports the resulting state. */
  async setPreference(
    userId: string,
    providerId: AiProviderId,
    model?: string,
  ): Promise<AiStatusResponse> {
    const provider = this.providers.find((entry) => entry.id === providerId);

    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${providerId}`);
    }

    if (!provider.isConfigured) {
      throw new BadRequestException(
        `${provider.label} is not configured on this server.`,
      );
    }

    if (model && !provider.models.includes(model)) {
      throw new BadRequestException(
        `${provider.label} is not configured for model "${model}".`,
      );
    }

    await this.users.setAiPreference(userId, providerId, model ?? null);

    return this.status(userId);
  }

  /** Selects context, builds the prompt and streams the answer. */
  async *streamAnswer(
    request: AnswerRequest,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const { provider, model } = await this.resolveFor(request.userId);

    const context = await this.contextAssembler.assemble({
      userId: request.userId,
      pageId: request.pageId,
      question: request.question,
      content: request.page.content,
    });

    const prompt = this.promptBuilder.build({
      question: request.question,
      history: request.history,
      page: {
        url: request.page.url,
        title: request.page.title,
        content: context.content,
        partial: context.partial,
      },
    });

    yield* provider.streamAnswer(prompt, model, signal);
  }
}
