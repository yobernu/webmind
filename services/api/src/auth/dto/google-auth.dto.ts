import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  /** ID token obtained by the extension through chrome.identity. */
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
