export interface ConversationEntity {
  id: string;
  pageId: string;
  title: string | null;
  /** Present when the conversation was listed with counts. */
  messageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationRow {
  id: string;
  pageId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}
