import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  AI_PROVIDER_IDS,
  type AiProviderId,
} from '../providers/ai-provider.interface.js';

/** One selectable provider, as reported to the extension. */
export interface AiProviderSummary {
  id: AiProviderId;
  label: string;
  /** False when the server has no credential for it; the UI disables it. */
  enabled: boolean;
  models: string[];
  defaultModel: string;
}

export interface AiStatusResponse {
  /** True when at least one provider can answer. */
  enabled: boolean;
  providers: AiProviderSummary[];
  /** What this user's questions will actually use right now. */
  selected: { provider: AiProviderId; model: string } | null;
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

/** Events emitted over SSE while an answer is produced. Errors travel in-band
 * because an HTTP status cannot be changed once streaming has started. */
export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; content: string }
  | { type: 'error'; message: string };
