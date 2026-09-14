import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  AI_PROVIDER_IDS,
  type AiProviderId,
} from '../providers/ai-provider.interface.js';

/** One selectable provider, as reported to the extension. */
export interface AiProviderSummary {
  id: AiProviderId;
  label: string;
  /** Usable by this user: the server has a key, or they supplied one. */
  enabled: boolean;
  /** Whether the server holds a shared key for it. */
  hasServerKey: boolean;
  /** Whether this user has stored their own key for it. */
  hasUserKey: boolean;
  models: string[];
  defaultModel: string;
}

export interface AiStatusResponse {
  /** True when at least one provider can answer for this user. */
  enabled: boolean;
  /** Whether the server can store user keys at all (encryption configured). */
  byokAvailable: boolean;
  providers: AiProviderSummary[];
  /** What this user's questions will actually use right now, and whose key. */
  selected: {
    provider: AiProviderId;
    model: string;
    usingUserKey: boolean;
  } | null;
  /**
   * Whether similarity retrieval is available. Only Gemini can embed, so
   * answering through OpenRouter without a Gemini key still works but falls
   * back to truncating long pages.
   */
  retrievalAvailable: boolean;
}

export class UpdateAiPreferenceDto {
  @IsIn(AI_PROVIDER_IDS as unknown as string[])
  provider: AiProviderId;

  /** Must be one of the provider's configured models; validated in the service
   * where the provider list is known. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}

/**
 * Phases the client can show while waiting. Each corresponds to real work:
 * `reading` and `searching` cover context assembly (the second only when
 * similarity retrieval engages on a long page), `thinking` is the wait for the
 * provider's first token. There is deliberately no stage for work the backend
 * does not do.
 */
export type AiStage = 'reading' | 'searching' | 'thinking';

/** Events emitted over SSE while an answer is produced. Errors travel in-band
 * because an HTTP status cannot be changed once streaming has started. */
export type AiStreamEvent =
  | { type: 'status'; stage: AiStage }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; content: string }
  | { type: 'error'; message: string };

/** What the API may reveal about a stored key: enough to identify it, never
 * enough to use it. */
export interface CredentialSummaryDto {
  provider: AiProviderId;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export class StoreCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  apiKey: string;
}
