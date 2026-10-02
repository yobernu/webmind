import { IsOptional, IsString, MaxLength } from 'class-validator';

export const MAX_NAME_LENGTH = 100;

export class UpdateUserDto {
  /** Display name; an empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;
}
