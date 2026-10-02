import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from './config/env/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { PagesModule } from './pages/pages.module.js';
import { AiModule } from './ai/ai.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { NotesModule } from './notes/notes.module.js';
import { HighlightsModule } from './highlights/highlights.module.js';
import { SearchModule } from './search/search.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Fails the boot on a malformed secret rather than at first use.
      validate: validateEnv,
    }),

    // Named throttler buckets; routes opt in with a throttler guard plus
    // @Throttle, and skip the buckets that are not theirs, because a guarded
    // route is checked against every bucket. Nothing is limited by default.
    //   ai   — answers, per user (the AI message endpoint)
    //   auth — credential checks, per IP (login, sign-up, Google)
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'ai', limit: 30, ttl: 3_600_000 },
        { name: 'auth', limit: 10, ttl: 60_000 },
      ],
    }),

    PrismaModule,
    UsersModule,
    AuthModule,
    PagesModule,
    AiModule,
    ConversationsModule,
    MessagesModule,
    NotesModule,
    HighlightsModule,
    SearchModule,
  ],
  providers: [
    // Every route requires a valid token unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
