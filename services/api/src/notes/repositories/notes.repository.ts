import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    pageId: string,
    content: string,
    sourceText: string | null,
  ) {
    return this.prisma.note.create({
      data: { userId, pageId, content, sourceText },
    });
  }

  /** Scoped by user as well as id, so a leaked id reads nothing. */
  async findOwned(userId: string, noteId: string) {
    return this.prisma.note.findFirst({ where: { id: noteId, userId } });
  }

  /** Newest first, as the side panel lists them. */
  async listForPage(userId: string, pageId: string, limit = 100) {
    return this.prisma.note.findMany({
      where: { userId, pageId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async updateContent(noteId: string, content: string) {
    return this.prisma.note.update({
      where: { id: noteId },
      data: { content },
    });
  }

  async delete(noteId: string) {
    await this.prisma.note.delete({ where: { id: noteId } });
  }
}
