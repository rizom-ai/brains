import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Wish status
 * - new: just captured, not yet triaged
 * - planned: acknowledged, on the roadmap
 * - in-progress: actively being worked on
 * - done: capability shipped
 * - declined: explicitly declined with reason
 */
export const wishStatusSchema = z.enum([
  "new",
  "planned",
  "in-progress",
  "done",
  "declined",
]);

export const wishPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

/**
 * Wish frontmatter schema (stored in content as YAML frontmatter)
 * Body contains the description of what the user wanted.
 */
export const wishFrontmatterSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema.default("medium"),
  requested: z.number().int().default(1),
  tags: z.array(z.string()).default([]),
  declinedReason: z.string().optional(),
});

/**
 * Wish metadata schema - derived from frontmatter via .pick()
 * Only includes fields needed for fast DB queries/filtering.
 */
export const wishMetadataSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema,
  requested: z.number().int(),
  slug: z.string(),
});

/**
 * Wish entity schema
 */
export const wishSchema = baseEntitySchema.extend({
  entityType: z.literal("wish"),
  metadata: wishMetadataSchema,
});

/**
 * Wishlist plugin configuration schema
 */
export const wishlistConfigSchema = z.object({});

export type WishStatus = z.infer<typeof wishStatusSchema>;
export type WishPriority = z.infer<typeof wishPrioritySchema>;
export type WishFrontmatter = z.infer<typeof wishFrontmatterSchema>;
export type WishMetadata = z.infer<typeof wishMetadataSchema>;
export type WishEntity = z.infer<typeof wishSchema>;
export type WishlistConfig = z.infer<typeof wishlistConfigSchema>;
