/**
 * Blog post entity shape (minimal fields needed for newsletter handlers)
 */
export interface BlogPost {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  created: string;
  updated: string;
  metadata: {
    title: string;
    slug: string;
    status: string;
    excerpt?: string;
  };
}
