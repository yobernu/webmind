import { Injectable } from '@nestjs/common';

import { assertOwned } from '../../common/utils/ownership.js';
import { toPageResponse } from '../dto/page-response.dto.js';
import type { PageWorkspaceResponse } from '../dto/page-workspace.dto.js';
import { PagesRepository } from '../repositories/pages.repository.js';

/**
 * What the side panel needs to render a page's workspace. Only counts for now;
 * the collections themselves arrive with the notes, highlights and
 * conversations features.
 */
@Injectable()
export class WorkspaceService {
  constructor(private readonly pages: PagesRepository) {}

  async forPage(userId: string, pageId: string): Promise<PageWorkspaceResponse> {
    const page = assertOwned(
      await this.pages.findOwned(userId, pageId),
      'Page',
    );

    return {
      page: toPageResponse(page),
      counts: await this.pages.countRelated(page.id),
    };
  }
}
