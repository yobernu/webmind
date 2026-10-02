import { Injectable } from '@nestjs/common';

import type { MessageRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AppendOptions {
  /** The answer was cut short; see `Message.incomplete`. */
  incomplete?: boolean;
  /** Sets the conversation's title in the same write. */
  title?: string;
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends a message and marks the conversation active, atomically (SRS
   * §9.3). Locking the conversation row serialises concurrent appends, so two
   * messages can never claim the same position.
   */
  async create(
    conversationId: string,
    role: MessageRole,
    content: string,
    options: AppendOptions = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "conversations" WHERE "id" = ${conversationId} FOR UPDATE`;

      const last = await tx.message.aggregate({
        where: { conversationId },
        _max: { sequence: true },
      });

      const message = await tx.message.create({
        data: {
          conversationId,
          role,
          content,
          sequence: (last._max.sequence ?? 0) + 1,
          incomplete: options.incomplete ?? false,
        },
      });

      // Keeps `updatedAt` meaningful as "last activity" (PRD §9.6).
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
          ...(options.title === undefined ? {} : { title: options.title }),
        },
      });

      return message;
    });
  }

  /** Oldest first, in the order the messages were written (FR-05). */
  async listForConversation(conversationId: string, limit?: number) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
      take: limit,
    });
  }

  /**
   * The most recent complete turns, returned oldest-first for prompt assembly.
   * A cut-off answer is left out: replaying it would present half a thought
   * to the model as something it said.
   */
  async listRecent(conversationId: string, limit: number) {
    const recent = await this.prisma.message.findMany({
      where: { conversationId, incomplete: false },
      orderBy: { sequence: 'desc' },
      take: limit,
    });

    return recent.reverse();
  }
}
