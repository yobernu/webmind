import type { PageEntity, PageRow } from '../entities/page.entity.js';

/**
 * Never returns `content`: page bodies are large, and every caller so far only
 * needs to know whether one is stored.
 */
export function toPageResponse(page: PageRow): PageEntity {
  return {
    id: page.id,
    url: page.url,
    canonicalUrl: page.canonicalUrl,
    domain: page.domain,
    title: page.title,
    contentHash: page.contentHash,
    hasContent: page.content !== null && page.content.length > 0,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

export interface ResolvePageResponse {
  page: PageEntity;
  /**
   * True when the API has no stored text for this `contentHash`, telling the
   * extension to follow up with the body. False means "already have it".
   */
  needsContent: boolean;
}
