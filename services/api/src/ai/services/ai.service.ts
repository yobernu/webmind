import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { UsersService } from '../../users/services/users.service.js';
import {
  CredentialsService,
  type ResolvedCredential,
} from './credentials.service.js';
import type {
  AiProviderSummary,
  AiStatusResponse,
} from '../dto/ai-completion.dto.js';
import type {
  AiMessage,
  AiPrompt,
} from '../interfaces/ai-message.interface.js';
import {
  AI_ANSWER_PROVIDERS,
  EMBEDDING_PROVIDER,
  isAiProviderId,
  type AiAnswerProvider,
  type AiProviderId,
  type EmbeddingProvider,
} from '../providers/ai-provider.interface.js';
import {
  ContextAssemblerService,
  type AssembledContext,
} from './context-assembler.service.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import {
  extractAnswer,
  NoAnswerError,
  type FilterOutcome,
} from '../utils/answer-stream.js';

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
  /** Whose key this request will spend. */
  credential: ResolvedCredential;
}

/** Result of `prepare`: ready to stream, plus how context was selected. */
export interface PreparedAnswer extends ResolvedProvider {
  prompt: AiPrompt;
  strategy: AssembledContext['strategy'];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_ANSWER_PROVIDERS)
    private readonly providers: AiAnswerProvider[],
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly contextAssembler: ContextAssemblerService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
  ) {}

  /** Providers usable by this user: the server has a key, or they do. */
  private async availableFor(userId: string): Promise<AiAnswerProvider[]> {
    const usable = await Promise.all(
      this.providers.map(async (provider) =>
        provider.hasServerKey ||
        (await this.credentials.hasUserKey(userId, provider.id))
          ? provider
          : null,
      ),
    );

    return usable.filter((provider): provider is AiAnswerProvider => provider !== null);
  }

  /** Whether any provider has a server key. User keys are per-user, so this is
   * only the server-wide answer used before a user is known. */
  get isConfigured(): boolean {
    return this.providers.some((provider) => provider.hasServerKey);
  }

  async isConfiguredFor(userId: string): Promise<boolean> {
    return (await this.availableFor(userId)).length > 0;
  }

  async status(userId: string): Promise<AiStatusResponse> {
    const resolved = await this.resolveFor(userId).catch(() => null);

    const providers: AiProviderSummary[] = await Promise.all(
      this.providers.map(async (provider) => {
        const hasUserKey = await this.credentials.hasUserKey(
          userId,
          provider.id,
        );

        return {
          id: provider.id,
          label: provider.label,
          // Usable if the server has a key or this user supplied one.
          enabled: provider.hasServerKey || hasUserKey,
          hasServerKey: provider.hasServerKey,
          hasUserKey,
          models: [...provider.models],
          defaultModel: provider.defaultModel,
        };
      }),
    );

    // Embeddings are Gemini-only, and may run on the user's Gemini key.
    const retrievalAvailable =
      this.embeddingProvider.hasServerKey ||
      (await this.credentials.hasUserKey(userId, 'gemini'));

    return {
      enabled: providers.some((provider) => provider.enabled),
      byokAvailable: this.credentials.isAvailable,
      providers,
      selected: resolved
        ? {
            provider: resolved.provider.id,
            model: resolved.model,
            usingUserKey: resolved.credential.source === 'user',
          }
        : null,
      retrievalAvailable,
    };
  }

  /**
   * Applies the user's stored preference, falling back rather than failing:
   * a preference naming a provider that is no longer configured (key removed,
   * provider dropped from the build) resolves to the first available one, so an
   * old preference cannot lock someone out of answers.
   */
  async resolveFor(userId: string): Promise<ResolvedProvider> {
    const available = await this.availableFor(userId);

    if (available.length === 0) {
      throw new ServiceUnavailableException(
        'No AI provider is available. Add your own API key to continue.',
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

    // The user's own key when they have one, the server's otherwise.
    const credential = await this.credentials.resolveCredential(
      userId,
      provider.id,
    );

    return { provider, model, credential };
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

    const usable =
      provider.hasServerKey ||
      (await this.credentials.hasUserKey(userId, providerId));

    if (!usable) {
      throw new BadRequestException(
        `${provider.label} has no key on this server. Add your own to use it.`,
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

  /**
   * Everything needed to start generating: which provider answers, the prompt,
   * and how the page context was chosen.
   *
   * Separate from `stream` so the caller can report the phase boundary to the
   * user — context assembly involves an embedding round-trip and a similarity
   * search on long pages, which is a visible wait worth naming.
   */
  async prepare(request: AnswerRequest): Promise<PreparedAnswer> {
    const { provider, model, credential } = await this.resolveFor(request.userId);

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

    return { provider, model, credential, prompt, strategy: context.strategy };
  }

  /**
   * Streams the answer for an already-prepared prompt.
   *
   * The provider's output passes through `extractAnswer`, which enforces the
   * output contract declared in the system instruction. PromptBuilderService
   * governs what goes into the model; this governs what is allowed out. Neither
   * responsibility belongs in vendor code, and neither can be left to the
   * model's goodwill — a model that ignores "do not think aloud" will still
   * have its scratchpad withheld here.
   */
  async *stream(
    prepared: PreparedAnswer,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    // Timestamped before streaming: the point is to record that the key was
    // used, which is true even if generation then fails.
    void this.credentials.markUsed(prepared.credential);

    const raw = prepared.provider.streamAnswer(
      prepared.prompt,
      prepared.model,
      prepared.credential.apiKey,
      signal,
    );

    let outcome: FilterOutcome | undefined;

    yield* extractAnswer(raw, (result) => {
      outcome = result;

      if (result.abandoned) {
        this.logger.warn(
          `${prepared.model} was cut off after ${result.discarded} characters without reaching an answer.`,
        );
        return;
      }

      if (!result.honoured) {
        // Worth knowing: this model needs watching, and its users will see
        // whatever preamble it produced.
        this.logger.warn(
          `${prepared.model} did not emit the answer marker; its full output was shown.`,
        );
        return;
      }

      if (result.discarded > 0) {
        this.logger.debug(
          `${prepared.model}: withheld ${result.discarded} characters of reasoning.`,
        );
      }
    });

    // Thrown after the loop rather than inside the callback, so a truncation
    // that still produced an answer keeps it: only the case with nothing to
    // show is a failure.
    if (outcome?.abandoned) {
      throw new NoAnswerError(
        `${prepared.model} used its whole output budget thinking and never reached an answer. Ask something narrower, or choose a different model.`,
      );
    }
  }

  /** Convenience for callers that do not report progress. */
  async *streamAnswer(
    request: AnswerRequest,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    yield* this.stream(await this.prepare(request), signal);
  }
}
