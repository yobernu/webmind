import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PagesService } from '../../pages/services/pages.service.js';
import type { NotesRepository } from '../repositories/notes.repository.js';
import { NotesService } from './notes.service.js';

const row = {
  id: 'note-1',
  userId: 'user-1',
  pageId: 'page-1',
  content: 'Remember this',
  sourceText: null as string | null,
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
};

function createDeps(
  options: { pageOwned?: boolean; noteOwned?: boolean } = {},
) {
  const notes = {
    create: vi.fn(
      async (
        _u: string,
        _p: string,
        content: string,
        sourceText: string | null,
      ) => ({
        ...row,
        content,
        sourceText,
      }),
    ),
    findOwned: vi.fn(async () => (options.noteOwned === false ? null : row)),
    listForPage: vi.fn(async () => [row]),
    updateContent: vi.fn(async (_id: string, content: string) => ({
      ...row,
      content,
    })),
    delete: vi.fn(async () => undefined),
  };

  const pages = {
    findOwned: vi.fn(async () => {
      if (options.pageOwned === false)
        throw new NotFoundException('Page not found');
      return { id: 'page-1' };
    }),
  };

  return {
    notes,
    pages,
    service: new NotesService(
      notes as unknown as NotesRepository,
      pages as unknown as PagesService,
    ),
  };
}

describe('NotesService', () => {
  it('creates a trimmed note with its source passage', async () => {
    const { service, notes } = createDeps();

    const result = await service.create(
      'user-1',
      'page-1',
      '  hi  ',
      ' quote ',
    );

    expect(notes.create).toHaveBeenCalledWith(
      'user-1',
      'page-1',
      'hi',
      'quote',
    );
    expect(result).not.toHaveProperty('userId');
    expect(result.sourceText).toBe('quote');
  });

  it('stores a blank source passage as null', async () => {
    const { service, notes } = createDeps();

    await service.create('user-1', 'page-1', 'hi', '   ');

    expect(notes.create).toHaveBeenCalledWith('user-1', 'page-1', 'hi', null);
  });

  it('refuses to create a note on a page the user does not own', async () => {
    const { service, notes } = createDeps({ pageOwned: false });

    await expect(service.create('user-2', 'page-1', 'hi')).rejects.toThrow(
      NotFoundException,
    );
    expect(notes.create).not.toHaveBeenCalled();
  });

  it('refuses to list notes of a page the user does not own', async () => {
    const { service, notes } = createDeps({ pageOwned: false });

    await expect(service.listForPage('user-2', 'page-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(notes.listForPage).not.toHaveBeenCalled();
  });

  it('lists a page’s notes scoped to the user', async () => {
    const { service, notes } = createDeps();

    const result = await service.listForPage('user-1', 'page-1');

    expect(notes.listForPage).toHaveBeenCalledWith('user-1', 'page-1');
    expect(result).toHaveLength(1);
  });

  it('updates an owned note', async () => {
    const { service, notes } = createDeps();

    const result = await service.update('user-1', 'note-1', ' edited ');

    expect(notes.findOwned).toHaveBeenCalledWith('user-1', 'note-1');
    expect(notes.updateContent).toHaveBeenCalledWith('note-1', 'edited');
    expect(result.content).toBe('edited');
  });

  it('404s when updating someone else’s note', async () => {
    const { service, notes } = createDeps({ noteOwned: false });

    await expect(service.update('user-2', 'note-1', 'x')).rejects.toThrow(
      NotFoundException,
    );
    expect(notes.updateContent).not.toHaveBeenCalled();
  });

  it('deletes an owned note and 404s on someone else’s', async () => {
    const owned = createDeps();
    await owned.service.remove('user-1', 'note-1');
    expect(owned.notes.delete).toHaveBeenCalledWith('note-1');

    const foreign = createDeps({ noteOwned: false });
    await expect(foreign.service.remove('user-2', 'note-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(foreign.notes.delete).not.toHaveBeenCalled();
  });
});
