import { z } from "@brains/utils";

/**
 * Schema for pagination information
 * Used by datasources that return paginated lists
 */
export const paginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

/**
 * Pagination information type
 */
export type PaginationInfo = z.infer<typeof paginationInfoSchema>;

/**
 * Build pagination info from total count and page parameters
 * Used for database-level pagination where we have a separate count query
 */
export function buildPaginationInfo(
  totalItems: number,
  page: number,
  pageSize: number,
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    currentPage: page,
    totalPages,
    totalItems,
    pageSize,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Options for paginating items
 */
export interface PaginateOptions {
  page?: number | undefined;
  limit?: number | undefined;
  pageSize?: number | undefined;
}

/**
 * Result of paginating items
 */
export interface PaginateResult<T> {
  items: T[];
  pagination: PaginationInfo | null;
}

/**
 * Paginate a list of items
 *
 * When `page` is specified, returns paginated results with pagination info.
 * When only `limit` is specified, returns first N items without pagination info.
 * When neither is specified, returns all items without pagination info.
 *
 * @param items - The full list of items to paginate (should already be sorted)
 * @param options - Pagination options
 * @returns Paginated items and optional pagination info
 */
export function paginateItems<T>(
  items: T[],
  options: PaginateOptions,
): PaginateResult<T> {
  const { page, limit, pageSize } = options;

  // When page is specified, use full pagination
  if (page !== undefined) {
    const currentPage = page;
    const itemsPerPage = pageSize ?? limit ?? items.length;
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    return {
      items: items.slice(startIndex, endIndex),
      pagination: {
        currentPage,
        totalPages,
        totalItems,
        pageSize: itemsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    };
  }

  // When only limit is specified, return first N items without pagination
  if (limit !== undefined) {
    return {
      items: items.slice(0, limit),
      pagination: null,
    };
  }

  // No pagination - return all items
  return {
    items,
    pagination: null,
  };
}
