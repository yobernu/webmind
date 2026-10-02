import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SearchController } from './controllers/search.controller.js';
import { SearchRepository } from './repositories/search.repository.js';
import { SearchService } from './services/search.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
})
export class SearchModule {}
