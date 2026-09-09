import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, pageId: string, title: string | null) {
    return this.prisma.conversation.create({
      data: { userId, pageId, title },
    });
  }

  /** Scoped by user as well as id, so a leaked id reads nothing. */
  async findOwned(userId: string, conversationId: string) {
    return this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
  }

  /** Newest first, with message counts for the page-history view. */
  async listForPage(userId: string, pageId: string, limit = 20) {
    return this.prisma.conversation.findMany({
      where: { userId, pageId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { _count: { select: { messages: true } } },
    });
  }

  async findLatestForPage(userId: string, pageId: string) {
    return this.prisma.conversation.findFirst({
      where: { userId, pageId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** Keeps `updatedAt` meaningful as "last activity" (PRD §9.6) and gives the
   * conversation a title from its first question when it had none. */
  async touch(conversationId: string, title?: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(title === undefined ? {} : { title }),
      },
    });
  }
}
