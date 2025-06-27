import type { SiteContentPreview, SiteContentProduction } from "@brains/types";
import type { ContentComparison } from "../types";

/**
 * Compare preview and production content for a given page and section
 */
export function compareContent(
  page: string,
  section: string,
  preview: SiteContentPreview,
  production: SiteContentProduction,
): ContentComparison {
  const differences: ContentComparison["differences"] = [];

  // Compare content fields
  // Compare main content
  if (preview.content !== production.content) {
    differences.push({
      field: "content",
      previewValue: preview.content,
      productionValue: production.content,
    });
  }

  // Compare created timestamps
  if (preview.created !== production.created) {
    differences.push({
      field: "created",
      previewValue: preview.created,
      productionValue: production.created,
    });
  }

  // Compare updated timestamps
  if (preview.updated !== production.updated) {
    differences.push({
      field: "updated",
      previewValue: preview.updated,
      productionValue: production.updated,
    });
  }

  // Note: We don't compare page/section as they should always match for the same content piece
  // Note: We don't compare entityType as they are intentionally different
  // Note: We don't compare id as they are intentionally different

  return {
    page,
    section,
    preview,
    production,
    differences,
    identical: differences.length === 0,
  };
}

/**
 * Check if preview and production content are substantially the same (ignoring timestamps and IDs)
 */
export function isContentEquivalent(
  preview: SiteContentPreview,
  production: SiteContentProduction,
): boolean {
  return (
    preview.content === production.content &&
    preview.page === production.page &&
    preview.section === production.section
  );
}
