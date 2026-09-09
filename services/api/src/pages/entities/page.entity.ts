/** A page row as the extension is allowed to see it. */
export interface PageEntity {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  contentHash: string | null;
  /** Whether extracted text is stored, without shipping the text itself. */
  hasContent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The stored shape this maps from. */
export interface PageRow {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  contentHash: string | null;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
}
