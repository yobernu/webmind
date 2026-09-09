import { MessageRole } from '../../generated/prisma/enums.js';

export { MessageRole };

/** Maps a stored role onto the provider-neutral chat roles. SYSTEM messages are
 * never sent back to the model: the system instruction is rebuilt per request
 * from trusted constants. */
export function toAiRole(role: MessageRole): 'user' | 'model' | null {
  switch (role) {
    case MessageRole.USER:
      return 'user';
    case MessageRole.ASSISTANT:
      return 'model';
    default:
      return null;
  }
}
