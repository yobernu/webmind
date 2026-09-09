import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_CONTENT_LENGTH } from '../services/page-content.service.js';

export class StoreContentDto {
  /** Readable text extracted from the page. */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT_LENGTH)
  content: string;

  /** Client-computed hash. Recomputed server-side; a mismatch is rejected. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentHash?: string;
}
