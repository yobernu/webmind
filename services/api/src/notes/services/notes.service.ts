import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import { PagesService } from '../../pages/services/pages.service.js';
import { toNoteResponse } from '../dto/note-response.dto.js';
import type { NoteEntity } from '../entities/note.entity.js';
import { NotesRepository } from '../repositories/notes.repository.js';

/** FR-06: notes belong to one user and one page. */
@Injectable()
export class NotesService {
  constructor(
    private readonly notes: NotesRepository,
    private readonly pages: PagesService,
  ) {}

  async create(
    userId: string,
    pageId: string,
    content: string,
    sourceText?: string,
  ): Promise<NoteEntity> {
    // Throws 404 unless the page belongs to this user.
    await this.pages.findOwned(userId, pageId);

    const note = await this.notes.create(
      userId,
      pageId,
      content.trim(),
      sourceText?.trim() || null,
    );

    return toNoteResponse(note);
  }

  async listForPage(userId: string, pageId: string): Promise<NoteEntity[]> {
    await this.pages.findOwned(userId, pageId);

    const rows = await this.notes.listForPage(userId, pageId);

    return rows.map(toNoteResponse);
  }

  async update(
    userId: string,
    noteId: string,
    content: string,
  ): Promise<NoteEntity> {
    const note = assertOwned(
      await this.notes.findOwned(userId, noteId),
      'Note',
    );

    return toNoteResponse(
      await this.notes.updateContent(note.id, content.trim()),
    );
  }

  async remove(userId: string, noteId: string): Promise<void> {
    const note = assertOwned(
      await this.notes.findOwned(userId, noteId),
      'Note',
    );

    await this.notes.delete(note.id);
  }
}
