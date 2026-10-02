/** The account fields the extension is allowed to see. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** The stored fields a PublicUser is built from. */
export interface PublicUserSource {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
