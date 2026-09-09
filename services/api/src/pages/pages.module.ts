import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PagesController } from './controllers/pages.controller.js';
import { PagesRepository } from './repositories/pages.repository.js';
import { PageContentService } from './services/page-content.service.js';
import { PageIdentityService } from './services/page-identity.service.js';
import { PagesService } from './services/pages.service.js';
import { WorkspaceService } from './services/workspace.service.js';

@Module({
  // AuthModule for JwtAuthGuard (it re-exports PassportModule); AiModule so a
  // stored page body is chunked and embedded as it arrives.
  imports: [AuthModule, AiModule],
  controllers: [PagesController],
  providers: [
    PagesService,
    PagesRepository,
    PageIdentityService,
    PageContentService,
    WorkspaceService,
  ],
  exports: [PagesService],
})
export class PagesModule {}
