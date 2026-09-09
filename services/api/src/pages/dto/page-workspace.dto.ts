import type { PageEntity } from '../entities/page.entity.js';

/** A page plus what the user has accumulated on it. */
export interface PageWorkspaceResponse {
  page: PageEntity;
  counts: {
    conversations: number;
    notes: number;
    highlights: number;
  };
}
