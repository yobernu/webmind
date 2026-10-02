import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiController } from './controllers/ai.controller.js';
import {
  AI_ANSWER_PROVIDERS,
  EMBEDDING_PROVIDER,
} from './providers/ai-provider.interface.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { CredentialsRepository } from './repositories/credentials.repository.js';
import { EmbeddingsRepository } from './repositories/embeddings.repository.js';
import { AiService } from './services/ai.service.js';
import { ContextAssemblerService } from './services/context-assembler.service.js';
import { CredentialsService } from './services/credentials.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { PromptBuilderService } from './services/prompt-builder.service.js';

@Module({
  // AuthModule re-exports PassportModule, which JwtAuthGuard needs.
  imports: [AuthModule, UsersModule],
  controllers: [AiController],
  providers: [
    GeminiProvider,
    OpenRouterProvider,
    AnthropicProvider,

    // Declaration order is the fallback order when a user has no preference.
    {
      provide: AI_ANSWER_PROVIDERS,
      inject: [GeminiProvider, OpenRouterProvider, AnthropicProvider],
      useFactory: (
        gemini: GeminiProvider,
        openRouter: OpenRouterProvider,
        anthropic: AnthropicProvider,
      ) => [gemini, openRouter, anthropic],
    },

    // Embeddings are Gemini-only: neither OpenRouter nor Anthropic offers an
    // embeddings endpoint.
    { provide: EMBEDDING_PROVIDER, useExisting: GeminiProvider },

    AiService,
    CredentialsService,
    CredentialsRepository,
    ContextAssemblerService,
    PromptBuilderService,
    EmbeddingService,
    EmbeddingsRepository,
  ],
  // CredentialsService is exported for the throttler guard, which needs to
  // know whose key a request will spend before the handler runs.
  exports: [AiService, EmbeddingService, CredentialsService],
})
export class AiModule {}
