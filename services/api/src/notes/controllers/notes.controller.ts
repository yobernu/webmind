import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { CreateNoteDto } from '../dto/create-note.dto.js';
import { UpdateNoteDto } from '../dto/update-note.dto.js';
import { NotesService } from '../services/notes.service.js';

/** Routes named exactly as SRS §6 specifies them. */
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post('pages/:id/notes')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notes.create(user.id, pageId, dto.content, dto.sourceText);
  }

  @Get('pages/:id/notes')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) pageId: string,
  ) {
    return this.notes.listForPage(user.id, pageId);
  }

  @Patch('notes/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user.id, noteId, dto.content);
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) noteId: string,
  ) {
    return this.notes.remove(user.id, noteId);
  }
}
