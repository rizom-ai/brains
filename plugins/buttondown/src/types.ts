import type { BaseEntity } from "@brains/plugins";

/**
 * Blog post entity shape (minimal fields needed for newsletter handlers)
 */
export interface BlogPost extends BaseEntity<{
  title: string;
  slug: string;
  status: string;
  excerpt?: string;
}> {
  entityType: string;
}
