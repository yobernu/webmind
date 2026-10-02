import type { PublicUser, PublicUserSource } from '../entities/user.entity.js';

/** Never includes the password hash, provider preferences or flags. */
export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}
