import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { HighlightSelector } from '../interfaces/selector.interface.js';

@Injectable()
export class HighlightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    pageId: string,
    selectedText: string,
    selector: HighlightSelector | null,
  ) {
    return this.prisma.highlight.create({
      data: {
        userId,
        pageId,
        selectedText,
        // Prisma wants a plain JSON value; the DTO instances are class objects.
        ...(selector ? { selector: JSON.parse(JSON.stringify(selector)) } : {}),
      },
    });
  }

  /** Scoped by user as well as id, so a leaked id reads nothing. */
  async findOwned(userId: string, highlightId: string) {
    return this.prisma.highlight.findFirst({
      where: { id: highlightId, userId },
    });
  }

  /** Oldest first: the order they were read in, which is usually page order. */
  async listForPage(userId: string, pageId: string, limit = 500) {
    return this.prisma.highlight.findMany({
      where: { userId, pageId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async delete(highlightId: string) {
    await this.prisma.highlight.delete({ where: { id: highlightId } });
  }
}
