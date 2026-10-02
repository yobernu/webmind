import type { MessageRole } from '../../generated/prisma/enums.js';

export interface MessageEntity {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** True for an answer cut short by a failure or a stop. */
  incomplete: boolean;
  createdAt: Date;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  incomplete?: boolean;
  createdAt: Date;
}
