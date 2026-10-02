import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { HighlightsController } from './controllers/highlights.controller.js';
import { HighlightsRepository } from './repositories/highlights.repository.js';
import { HighlightsService } from './services/highlights.service.js';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [HighlightsController],
  providers: [HighlightsService, HighlightsRepository],
  exports: [HighlightsService],
})
export class HighlightsModule {}
