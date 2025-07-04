import type { SiteContentEntityType } from "@brains/view-registry";

/**
 * Generate deterministic entity ID for site content
 * Format: ${entityType}:${page}:${section}
 */
export function generateSiteContentId(
  entityType: SiteContentEntityType,
  page: string,
  section: string,
): string {
  return `${entityType}:${page}:${section}`;
}

/**
 * Parse site content ID into its components
 */
export function parseSiteContentId(id: string): {
  entityType: SiteContentEntityType;
  pageId: string;
  sectionId: string;
} | null {
  const parts = id.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [entityType, pageId, sectionId] = parts;

  // Validate entity type and that all parts exist
  if (!entityType || !pageId || !sectionId) {
    return null;
  }

  if (
    entityType !== "site-content-preview" &&
    entityType !== "site-content-production"
  ) {
    return null;
  }

  return {
    entityType: entityType as SiteContentEntityType,
    pageId,
    sectionId,
  };
}

/**
 * Convert preview ID to production ID
 */
export function previewToProductionId(previewId: string): string | null {
  const parsed = parseSiteContentId(previewId);
  if (!parsed || parsed.entityType !== "site-content-preview") {
    return null;
  }

  return generateSiteContentId(
    "site-content-production",
    parsed.pageId,
    parsed.sectionId,
  );
}

/**
 * Convert production ID to preview ID
 */
export function productionToPreviewId(productionId: string): string | null {
  const parsed = parseSiteContentId(productionId);
  if (!parsed || parsed.entityType !== "site-content-production") {
    return null;
  }

  return generateSiteContentId(
    "site-content-preview",
    parsed.pageId,
    parsed.sectionId,
  );
}
