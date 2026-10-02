import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { MAX_NOTE_LENGTH } from './create-note.dto.js';

/** Only the body is editable; the page and source passage are fixed at creation. */
export class UpdateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTE_LENGTH)
  content!: string;
}
