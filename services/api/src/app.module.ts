import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PagesModule } from './pages/pages.module.js';
import { AiModule } from './ai/ai.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { MessagesModule } from './messages/messages.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Named throttler buckets; routes opt in with @Throttle (see the AI message
    // endpoint). Nothing is limited by default.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'ai', limit: 30, ttl: 3_600_000 }],
    }),

    PrismaModule,
    UsersModule,
    AuthModule,
    PagesModule,
    AiModule,
    ConversationsModule,
    MessagesModule,
  ],
})
export class AppModule {}
