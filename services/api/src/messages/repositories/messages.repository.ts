import { Injectable } from '@nestjs/common';

import type { MessageRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(conversationId: string, role: MessageRole, content: string) {
    return this.prisma.message.create({
      data: { conversationId, role, content },
    });
  }

  /**
   * Oldest first. `id` breaks ties because two messages written in the same
   * millisecond would otherwise order unpredictably, and FR-05 requires
   * ordering to be preserved.
   */
  async listForConversation(conversationId: string, limit?: number) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /** The most recent turns, returned oldest-first for prompt assembly. */
  async listRecent(conversationId: string, limit: number) {
    const recent = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return recent.reverse();
  }
}
