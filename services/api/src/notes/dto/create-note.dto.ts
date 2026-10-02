import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const MAX_NOTE_LENGTH = 20_000;
export const MAX_SOURCE_TEXT_LENGTH = 5_000;

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTE_LENGTH)
  content!: string;

  /** FR-06: the selected passage, when the note started from a selection. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SOURCE_TEXT_LENGTH)
  sourceText?: string;
}
