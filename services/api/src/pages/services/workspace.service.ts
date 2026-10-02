import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import { toConversationResponse } from '../../conversations/dto/conversation-response.dto.js';
import { toHighlightResponse } from '../../highlights/dto/highlight-response.dto.js';
import { toNoteResponse } from '../../notes/dto/note-response.dto.js';
import { toPageResponse } from '../dto/page-response.dto.js';
import type { PageWorkspaceResponse } from '../dto/page-workspace.dto.js';
import { PagesRepository } from '../repositories/pages.repository.js';

function latest(dates: Date[]): Date | null {
  return dates.reduce<Date | null>(
    (max, date) => (max === null || date > max ? date : max),
    null,
  );
}

/** What the side panel needs to restore a page's workspace (FR-08). */
@Injectable()
export class WorkspaceService {
  constructor(private readonly pages: PagesRepository) {}

  async forPage(userId: string, pageId: string): Promise<PageWorkspaceResponse> {
    const page = assertOwned(
      await this.pages.findOwned(userId, pageId),
      'Page',
    );

    const [collections, counts] = await Promise.all([
      this.pages.workspaceCollections(userId, page.id),
      this.pages.countRelated(page.id),
    ]);

    const conversations = collections.conversations.map((row) =>
      toConversationResponse(row, row._count.messages),
    );
    const notes = collections.notes.map(toNoteResponse);
    const highlights = collections.highlights.map(toHighlightResponse);

    return {
      page: toPageResponse(page),
      conversations,
      notes,
      highlights,
      counts,
      // Lists are ordered so their newest entries are enough to find the max.
      lastActivityAt: latest([
        ...conversations.map((c) => c.updatedAt),
        ...notes.map((n) => n.updatedAt),
        ...highlights.map((h) => h.createdAt),
      ]),
    };
  }
}
