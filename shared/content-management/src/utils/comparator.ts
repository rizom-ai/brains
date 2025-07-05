import type { SiteContent } from "@brains/types";

/**
 * Content comparison result
 */
export interface ContentComparison {
  pageId: string;
  sectionId: string;
  contentA: SiteContent;
  contentB: SiteContent;
  differences: Array<{
    field: string;
    valueA: unknown;
    valueB: unknown;
  }>;
  identical: boolean;
}

/**
 * Compare two site content entities for a given page and section
 */
export function compareContent(
  pageId: string,
  sectionId: string,
  contentA: SiteContent,
  contentB: SiteContent,
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

  // Note: We don't compare page/section as they should always match for the same content piece
  // Note: We don't compare entityType as they are intentionally different
  // Note: We don't compare id as they are intentionally different

  return {
    pageId,
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
  contentA: SiteContent,
  contentB: SiteContent,
): boolean {
  return (
    contentA.content === contentB.content &&
    contentA.pageId === contentB.pageId &&
    contentA.sectionId === contentB.sectionId
  );
}
