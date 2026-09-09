import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { MessagesController } from './controllers/messages.controller.js';
import { MessagesRepository } from './repositories/messages.repository.js';
import { MessagesService } from './services/messages.service.js';

@Module({
  imports: [AuthModule, AiModule, ConversationsModule, PagesModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRepository],
  exports: [MessagesService],
})
export class MessagesModule {}
