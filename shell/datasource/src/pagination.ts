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
