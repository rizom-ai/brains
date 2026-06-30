import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

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

const wishStatusParserSchema = z.enum([
  "new",
  "planned",
  "in-progress",
  "done",
  "declined",
]);
const wishPriorityParserSchema = z.enum(["low", "medium", "high", "critical"]);

/**
 * Wish frontmatter schema (stored in content as YAML frontmatter)
 * Body contains the description of what the user wanted.
 */
export const wishFrontmatterSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema.default("medium"),
  requested: z.number().int().default(1),
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
const wishEntityMetadataParserSchema = z.object({
  title: z.string(),
  status: wishStatusParserSchema,
  priority: wishPriorityParserSchema,
  requested: z.number().int(),
  slug: z.string(),
});

export const wishSchema = baseEntityParserSchema.extend({
  entityType: z.literal("wish"),
  metadata: wishEntityMetadataParserSchema,
});

export type WishStatus = z.output<typeof wishStatusSchema>;
export type WishPriority = z.output<typeof wishPrioritySchema>;
export type WishFrontmatter = z.output<typeof wishFrontmatterSchema>;
export type WishMetadata = z.output<typeof wishMetadataSchema>;
export type WishEntity = z.output<typeof wishSchema>;
