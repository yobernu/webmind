import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { ConversationsController } from './controllers/conversations.controller.js';
import { ConversationsRepository } from './repositories/conversations.repository.js';
import { ConversationsService } from './services/conversations.service.js';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsService, ConversationsRepository],
})
export class ConversationsModule {}
