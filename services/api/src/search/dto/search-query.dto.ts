import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SEARCH_RESULT_TYPES = ['note', 'message', 'highlight'] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export const DEFAULT_SEARCH_LIMIT = 20;

export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q!: string;

  /** Restricts results to one kind of saved item. */
  @IsOptional()
  @IsIn(SEARCH_RESULT_TYPES)
  type?: SearchResultType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
