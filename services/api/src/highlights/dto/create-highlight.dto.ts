import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_HIGHLIGHT_LENGTH = 5_000;
/** Context either side of a quote; enough to disambiguate, small enough to store. */
export const MAX_AFFIX_LENGTH = 64;

export class TextQuoteSelectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HIGHLIGHT_LENGTH)
  exact!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_AFFIX_LENGTH)
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_AFFIX_LENGTH)
  suffix?: string;
}

export class TextPositionSelectorDto {
  @IsInt()
  @Min(0)
  start!: number;

  @IsInt()
  @Min(0)
  end!: number;
}

export class HighlightSelectorDto {
  @ValidateNested()
  @Type(() => TextQuoteSelectorDto)
  quote!: TextQuoteSelectorDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TextPositionSelectorDto)
  position?: TextPositionSelectorDto;
}

export class CreateHighlightDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HIGHLIGHT_LENGTH)
  selectedText!: string;

  /** FR-07: enough location metadata to re-find the passage later. */
  @IsOptional()
  @ValidateNested()
  @Type(() => HighlightSelectorDto)
  selector?: HighlightSelectorDto;
}
