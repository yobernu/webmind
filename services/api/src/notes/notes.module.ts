import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { NotesController } from './controllers/notes.controller.js';
import { NotesRepository } from './repositories/notes.repository.js';
import { NotesService } from './services/notes.service.js';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [NotesController],
  providers: [NotesService, NotesRepository],
  exports: [NotesService],
})
export class NotesModule {}
