import { IsOptional, IsString, MaxLength } from 'class-validator';

export const MAX_TITLE_LENGTH = 200;

export class CreateConversationDto {
  /** Optional; otherwise the title is derived from the first question. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;
}
