import type {
  ConversationEntity,
  ConversationRow,
} from '../entities/conversation.entity.js';

export function toConversationResponse(
  conversation: ConversationRow,
  messageCount?: number,
): ConversationEntity {
  return {
    id: conversation.id,
    pageId: conversation.pageId,
    title: conversation.title,
    ...(messageCount === undefined ? {} : { messageCount }),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}
