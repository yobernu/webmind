import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class ResolvePageDto {
  /** The URL as visited, before normalisation. */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  /** The page's own `<link rel="canonical">`, honoured only if same-host. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  canonicalHint?: string;

  /** sha256 of the extracted text, so the API can skip an upload it has. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentHash?: string;
}
