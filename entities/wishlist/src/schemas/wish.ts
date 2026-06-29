import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";
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

const wishStatusParserSchema = z4.enum([
  "new",
  "planned",
  "in-progress",
  "done",
  "declined",
]);
const wishPriorityParserSchema = z4.enum(["low", "medium", "high", "critical"]);

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
const wishEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  status: wishStatusParserSchema,
  priority: wishPriorityParserSchema,
  requested: z4.number().int(),
  slug: z4.string(),
});

export const wishSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("wish"),
  metadata: wishEntityMetadataParserSchema,
});

export type WishStatus = z.output<typeof wishStatusSchema>;
export type WishPriority = z.output<typeof wishPrioritySchema>;
export type WishFrontmatter = z.output<typeof wishFrontmatterSchema>;
export type WishMetadata = z.output<typeof wishMetadataSchema>;
export type WishEntity = z4.output<typeof wishSchema>;
