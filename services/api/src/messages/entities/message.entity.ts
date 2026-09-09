import type { MessageRole } from '../../generated/prisma/enums.js';

export interface MessageEntity {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}
