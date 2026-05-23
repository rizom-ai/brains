import type { ContentVisibility } from "@brains/plugins";

export interface SiteContentResolutionOptions {
  /** Look up previously saved content from entity storage. */
  savedContent?: {
    entityType: string;
    entityId: string;
  };
  /** Parameters for DataSource fetch operation. */
  dataParams?: unknown;
  /** Format for DataSource transform operation. */
  transformFormat?: string;
  /** Static fallback content. */
  fallback?: unknown;
  /** Filter to published/complete content for production builds. */
  publishedOnly?: boolean;
  /**
   * Visibility scope passed to the content service so entity lookups within
   * the resolution are scoped (production: "public", preview: "restricted").
   */
  visibilityScope?: ContentVisibility;
}
