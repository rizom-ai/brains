import type { JSX } from "preact";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  /** Number of page links to show around current page */
  siblingCount?: number;
}

/**
 * Generate page URL based on page number
 */
function getPageUrl(baseUrl: string, page: number): string {
  if (page === 1) {
    return baseUrl;
  }
  // Remove trailing slash if present
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBase}/page/${page}`;
}

/**
 * Generate array of page numbers to display
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];

  // Always show first page
  pages.push(1);

  // Calculate range around current page
  const rangeStart = Math.max(2, currentPage - siblingCount);
  const rangeEnd = Math.min(totalPages - 1, currentPage + siblingCount);

  // Add ellipsis after first page if needed
  if (rangeStart > 2) {
    pages.push("ellipsis");
  }

  // Add pages in range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (rangeEnd < totalPages - 1) {
    pages.push("ellipsis");
  }

  // Always show last page (if more than 1 page)
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Pagination component for navigating through pages of content
 */
export const Pagination = ({
  currentPage,
  totalPages,
  baseUrl,
  siblingCount = 1,
}: PaginationProps): JSX.Element | null => {
  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages, siblingCount);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1 mt-12"
    >
      {/* Previous button */}
      {hasPrevPage ? (
        <a
          href={getPageUrl(baseUrl, currentPage - 1)}
          className="px-3 py-2 text-sm font-medium text-theme hover:text-brand hover:bg-surface rounded-md transition-colors"
          aria-label="Previous page"
        >
          ← Prev
        </a>
      ) : (
        <span className="px-3 py-2 text-sm font-medium text-theme-muted cursor-not-allowed">
          ← Prev
        </span>
      )}

      {/* Page numbers */}
      <div className="flex items-center gap-1 mx-2">
        {pageNumbers.map((page, index) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 py-2 text-sm text-theme-muted"
            >
              …
            </span>
          ) : page === currentPage ? (
            <span
              key={page}
              className="px-3 py-2 text-sm font-semibold text-brand bg-surface rounded-md"
              aria-current="page"
            >
              {page}
            </span>
          ) : (
            <a
              key={page}
              href={getPageUrl(baseUrl, page)}
              className="px-3 py-2 text-sm font-medium text-theme hover:text-brand hover:bg-surface rounded-md transition-colors"
            >
              {page}
            </a>
          ),
        )}
      </div>

      {/* Next button */}
      {hasNextPage ? (
        <a
          href={getPageUrl(baseUrl, currentPage + 1)}
          className="px-3 py-2 text-sm font-medium text-theme hover:text-brand hover:bg-surface rounded-md transition-colors"
          aria-label="Next page"
        >
          Next →
        </a>
      ) : (
        <span className="px-3 py-2 text-sm font-medium text-theme-muted cursor-not-allowed">
          Next →
        </span>
      )}
    </nav>
  );
};
