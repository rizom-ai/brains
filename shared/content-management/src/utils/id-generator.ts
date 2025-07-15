import type { SiteContentEntityType } from "@brains/view-registry";

/**
 * Generate deterministic entity ID for site content
 * Format: ${entityType}:${routeId}:${sectionId}
 */
export function generateSiteContentId(
  entityType: SiteContentEntityType,
  routeId: string,
  sectionId: string,
): string {
  return `${entityType}:${routeId}:${sectionId}`;
}

/**
 * Parse site content ID into its components
 */
export function parseSiteContentId(id: string): {
  entityType: SiteContentEntityType;
  routeId: string;
  sectionId: string;
} | null {
  const parts = id.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [entityType, routeId, sectionId] = parts;

  // Validate entity type and that all parts exist
  if (!entityType || !routeId || !sectionId) {
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
    routeId,
    sectionId,
  };
}

/**
 * Convert between site content entity types
 * This is a generic function that can convert from any entity type to another
 */
export function convertSiteContentId(
  id: string,
  targetEntityType: SiteContentEntityType,
): string | null {
  const parsed = parseSiteContentId(id);
  if (!parsed) {
    return null;
  }

  return generateSiteContentId(
    targetEntityType,
    parsed.routeId,
    parsed.sectionId,
  );
}

/**
 * Convert preview ID to production ID
 * (Convenience function for common use case)
 */
export function previewToProductionId(previewId: string): string | null {
  const parsed = parseSiteContentId(previewId);
  if (!parsed || parsed.entityType !== "site-content-preview") {
    return null;
  }

  return generateSiteContentId(
    "site-content-production",
    parsed.routeId,
    parsed.sectionId,
  );
}

/**
 * Convert production ID to preview ID
 * (Convenience function for common use case)
 */
export function productionToPreviewId(productionId: string): string | null {
  const parsed = parseSiteContentId(productionId);
  if (!parsed || parsed.entityType !== "site-content-production") {
    return null;
  }

  return generateSiteContentId(
    "site-content-preview",
    parsed.routeId,
    parsed.sectionId,
  );
}
