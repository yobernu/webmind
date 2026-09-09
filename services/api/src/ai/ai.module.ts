import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiController } from './controllers/ai.controller.js';
import {
  AI_ANSWER_PROVIDERS,
  EMBEDDING_PROVIDER,
} from './providers/ai-provider.interface.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { EmbeddingsRepository } from './repositories/embeddings.repository.js';
import { AiService } from './services/ai.service.js';
import { ContextAssemblerService } from './services/context-assembler.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { PromptBuilderService } from './services/prompt-builder.service.js';

@Module({
  // AuthModule re-exports PassportModule, which JwtAuthGuard needs.
  imports: [AuthModule, UsersModule],
  controllers: [AiController],
  providers: [
    GeminiProvider,
    OpenRouterProvider,

    // Declaration order is the fallback order when a user has no preference.
    {
      provide: AI_ANSWER_PROVIDERS,
      inject: [GeminiProvider, OpenRouterProvider],
      useFactory: (gemini: GeminiProvider, openRouter: OpenRouterProvider) => [
        gemini,
        openRouter,
      ],
    },

    // Embeddings are Gemini-only: OpenRouter has no embeddings endpoint.
    { provide: EMBEDDING_PROVIDER, useExisting: GeminiProvider },

    AiService,
    ContextAssemblerService,
    PromptBuilderService,
    EmbeddingService,
    EmbeddingsRepository,
  ],
  exports: [AiService, EmbeddingService],
})
export class AiModule {}
