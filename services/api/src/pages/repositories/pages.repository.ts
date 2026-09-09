import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageIdentity } from '../services/page-identity.service.js';

/** The only Prisma-aware file in the pages module. */
@Injectable()
export class PagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the page, or refreshes the observed URL and title of the one that
   * already holds this canonical URL for the user. Stored content is left
   * alone: whether it needs replacing is decided by the hash comparison.
   */
  async upsertByCanonical(userId: string, identity: PageIdentity) {
    return this.prisma.page.upsert({
      where: {
        userId_canonicalUrl: { userId, canonicalUrl: identity.canonicalUrl },
      },
      create: {
        userId,
        url: identity.url,
        canonicalUrl: identity.canonicalUrl,
        domain: identity.domain,
        title: identity.title,
      },
      update: {
        url: identity.url,
        // Keep the previous title when this visit could not read one.
        title: identity.title ?? undefined,
      },
    });
  }

  async findOwned(userId: string, pageId: string) {
    return this.prisma.page.findFirst({
      where: { id: pageId, userId },
    });
  }

  async updateContent(pageId: string, content: string, contentHash: string) {
    return this.prisma.page.update({
      where: { id: pageId },
      data: { content, contentHash },
    });
  }

  async countRelated(pageId: string) {
    const [conversations, notes, highlights] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where: { pageId } }),
      this.prisma.note.count({ where: { pageId } }),
      this.prisma.highlight.count({ where: { pageId } }),
    ]);

    return { conversations, notes, highlights };
  }
}
