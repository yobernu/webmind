import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import { PagesService } from '../../pages/services/pages.service.js';
import { toHighlightResponse } from '../dto/highlight-response.dto.js';
import type { HighlightEntity } from '../entities/highlight.entity.js';
import type { HighlightSelector } from '../interfaces/selector.interface.js';
import { HighlightsRepository } from '../repositories/highlights.repository.js';

/** FR-07: saved passages, each tied to one user and one page. */
@Injectable()
export class HighlightsService {
  constructor(
    private readonly highlights: HighlightsRepository,
    private readonly pages: PagesService,
  ) {}

  async create(
    userId: string,
    pageId: string,
    selectedText: string,
    selector?: HighlightSelector,
  ): Promise<HighlightEntity> {
    // Throws 404 unless the page belongs to this user.
    await this.pages.findOwned(userId, pageId);

    const highlight = await this.highlights.create(
      userId,
      pageId,
      selectedText,
      selector ?? null,
    );

    return toHighlightResponse(highlight);
  }

  async listForPage(
    userId: string,
    pageId: string,
  ): Promise<HighlightEntity[]> {
    await this.pages.findOwned(userId, pageId);

    const rows = await this.highlights.listForPage(userId, pageId);

    return rows.map(toHighlightResponse);
  }

  async remove(userId: string, highlightId: string): Promise<void> {
    const highlight = assertOwned(
      await this.highlights.findOwned(userId, highlightId),
      'Highlight',
    );

    await this.highlights.delete(highlight.id);
  }
}
