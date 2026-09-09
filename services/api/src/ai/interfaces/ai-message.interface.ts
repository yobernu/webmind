/** Provider-neutral chat turn. Only user and model turns exist here: the
 * system instruction is carried separately so that no caller can smuggle page
 * text into it (SRS §8). */
export type AiRole = 'user' | 'model';

export interface AiMessage {
  role: AiRole;
  content: string;
}

/** Everything a provider needs to answer one question. */
export interface AiPrompt {
  /** Trusted instructions. Never contains page or user-supplied content. */
  systemInstruction: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature: number;
}
