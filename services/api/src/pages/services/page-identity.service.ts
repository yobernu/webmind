import { BadRequestException, Injectable } from '@nestjs/common';

import type { ResolvePageDto } from '../dto/resolve-page.dto.js';
import { canonicalizeUrl } from '../utils/url-normalizer.js';

/** The stable identity of a page, derived from what the extension observed. */
export interface PageIdentity {
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
}

@Injectable()
export class PageIdentityService {
  /**
   * Derives the identity a page will be stored under. Rejects anything that is
   * not an ordinary web page, so `chrome://` and `file://` URLs never reach
   * the database.
   */
  identify(dto: ResolvePageDto): PageIdentity {
    const canonical = canonicalizeUrl(dto.url, dto.canonicalHint);

    if (!canonical) {
      throw new BadRequestException('Not an addressable web page');
    }

    const title = dto.title?.trim();

    return {
      url: dto.url,
      canonicalUrl: canonical.canonicalUrl,
      domain: canonical.domain,
      title: title && title.length > 0 ? title : null,
    };
  }
}
