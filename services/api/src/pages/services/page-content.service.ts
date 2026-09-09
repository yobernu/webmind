import { BadRequestException, Injectable } from '@nestjs/common';

import { hashContent, normalizeContent } from '../utils/content-hash.js';

/**
 * Upper bound on stored page text. Long enough for any article, short enough
 * that one page cannot balloon a row. Enforced here rather than in the schema
 * so the limit can move without a migration.
 */
export const MAX_CONTENT_LENGTH = 200_000;

export interface PreparedContent {
  content: string;
  contentHash: string;
}

@Injectable()
export class PageContentService {
  /**
   * Normalises the text and derives its hash.
   *
   * The client's claimed hash is verified rather than stored: `contentHash`
   * decides whether future uploads are skipped, so a wrong one would pin the
   * page to content it does not hold.
   */
  prepare(content: string, claimedHash?: string): PreparedContent {
    const normalized = normalizeContent(content);

    if (normalized.length === 0) {
      throw new BadRequestException('Page content is empty');
    }

    if (normalized.length > MAX_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Page content exceeds ${MAX_CONTENT_LENGTH} characters`,
      );
    }

    const contentHash = hashContent(normalized);

    if (claimedHash && claimedHash !== contentHash) {
      throw new BadRequestException('Content hash does not match the content');
    }

    return { content: normalized, contentHash };
  }
}
