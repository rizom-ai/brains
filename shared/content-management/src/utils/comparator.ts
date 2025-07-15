import type { SiteContentEntity } from "../types";

/**
 * Content comparison result
 */
export interface ContentComparison {
  routeId: string;
  sectionId: string;
  contentA: SiteContentEntity;
  contentB: SiteContentEntity;
  differences: Array<{
    field: string;
    valueA: unknown;
    valueB: unknown;
  }>;
  identical: boolean;
}

/**
 * Compare two site content entities for a given route and section
 */
export function compareContent(
  routeId: string,
  sectionId: string,
  contentA: SiteContentEntity,
  contentB: SiteContentEntity,
): ContentComparison {
  const differences: ContentComparison["differences"] = [];

  // Compare content fields
  // Compare main content
  if (contentA.content !== contentB.content) {
    differences.push({
      field: "content",
      valueA: contentA.content,
      valueB: contentB.content,
    });
  }

  // Compare created timestamps
  if (contentA.created !== contentB.created) {
    differences.push({
      field: "created",
      valueA: contentA.created,
      valueB: contentB.created,
    });
  }

  // Compare updated timestamps
  if (contentA.updated !== contentB.updated) {
    differences.push({
      field: "updated",
      valueA: contentA.updated,
      valueB: contentB.updated,
    });
  }

  // Note: We don't compare route/section as they should always match for the same content piece
  // Note: We don't compare entityType as they are intentionally different
  // Note: We don't compare id as they are intentionally different

  return {
    routeId,
    sectionId,
    contentA,
    contentB,
    differences,
    identical: differences.length === 0,
  };
}

/**
 * Check if two content entities are substantially the same (ignoring timestamps and IDs)
 */
export function isContentEquivalent(
  contentA: SiteContentEntity,
  contentB: SiteContentEntity,
): boolean {
  return (
    contentA.content === contentB.content &&
    contentA.routeId === contentB.routeId &&
    contentA.sectionId === contentB.sectionId
  );
}
