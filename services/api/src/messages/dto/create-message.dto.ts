import { IsString, MaxLength, MinLength } from 'class-validator';

/** Upper bound on a question. Long enough for a pasted paragraph, short enough
 * to bound prompt cost (SRS §8). */
export const MAX_QUESTION_LENGTH = 4_000;

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_QUESTION_LENGTH)
  content: string;
}
