import { Injectable } from '@nestjs/common';

import { EmbeddingService } from '../../ai/services/embedding.service.js';
import { assertOwned } from '../../common/utils/ownership.js';
import type { ResolvePageResponse } from '../dto/page-response.dto.js';
import { toPageResponse } from '../dto/page-response.dto.js';
import type { ResolvePageDto } from '../dto/resolve-page.dto.js';
import type { StoreContentDto } from '../dto/store-content.dto.js';
import type { PageEntity } from '../entities/page.entity.js';
import { PagesRepository } from '../repositories/pages.repository.js';
import { PageContentService } from './page-content.service.js';
import { PageIdentityService } from './page-identity.service.js';

@Injectable()
export class PagesService {
  constructor(
    private readonly pages: PagesRepository,
    private readonly identity: PageIdentityService,
    private readonly content: PageContentService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Records that the user is looking at this page and reports whether the API
   * still needs its text.
   */
  async resolve(
    userId: string,
    dto: ResolvePageDto,
  ): Promise<ResolvePageResponse> {
    const identity = this.identity.identify(dto);
    const page = await this.pages.upsertByCanonical(userId, identity);

    // Ask for the body when nothing is stored, or when what is stored came
    // from different text. Without a claimed hash there is nothing to compare,
    // so fall back to "send it if we have none".
    const needsContent = dto.contentHash
      ? page.contentHash !== dto.contentHash
      : page.content === null;

    return { page: toPageResponse(page), needsContent };
  }

  async storeContent(
    userId: string,
    pageId: string,
    dto: StoreContentDto,
  ): Promise<PageEntity> {
    const page = assertOwned(
      await this.pages.findOwned(userId, pageId),
      'Page',
    );

    const prepared = this.content.prepare(dto.content, dto.contentHash);

    const updated = await this.pages.updateContent(
      page.id,
      prepared.content,
      prepared.contentHash,
    );

    // Index for retrieval while we already have the text in hand. This never
    // throws: a failed embed leaves the page usable, since the context
    // assembler falls back to truncation.
    await this.embeddings.indexPage(userId, page.id, prepared.content);

    return toPageResponse(updated);
  }

  async findOwned(userId: string, pageId: string): Promise<PageEntity> {
    return toPageResponse(
      assertOwned(await this.pages.findOwned(userId, pageId), 'Page'),
    );
  }

  /**
   * The page including its stored text. Separate from `findOwned` so the
   * content body is only loaded where it is genuinely needed (prompt
   * assembly) and never leaks into an HTTP response by default.
   */
  async findOwnedWithContent(userId: string, pageId: string) {
    return assertOwned(await this.pages.findOwned(userId, pageId), 'Page');
  }
}
