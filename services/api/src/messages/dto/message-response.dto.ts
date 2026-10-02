import type { MessageEntity, MessageRow } from '../entities/message.entity.js';

export function toMessageResponse(message: MessageRow): MessageEntity {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    incomplete: message.incomplete ?? false,
    createdAt: message.createdAt,
  };
}
