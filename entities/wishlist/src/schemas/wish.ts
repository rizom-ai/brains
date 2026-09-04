import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Wish status
 * - new: just captured, not yet triaged
 * - planned: acknowledged, on the roadmap
 * - in-progress: actively being worked on
 * - done: capability shipped
 * - declined: explicitly declined with reason
 */
export const wishStatusSchema: z.ZodEnum<{
  new: "new";
  planned: "planned";
  "in-progress": "in-progress";
  done: "done";
  declined: "declined";
}> = z.enum(["new", "planned", "in-progress", "done", "declined"]);

export type WishStatus = z.output<typeof wishStatusSchema>;

export const wishPrioritySchema: z.ZodEnum<{
  low: "low";
  medium: "medium";
  high: "high";
  critical: "critical";
}> = z.enum(["low", "medium", "high", "critical"]);

export type WishPriority = z.output<typeof wishPrioritySchema>;

/**
 * Wish frontmatter schema (stored in content as YAML frontmatter)
 * Body contains the description of what the user wanted.
 */
type WishFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  status: typeof wishStatusSchema;
  priority: z.ZodDefault<typeof wishPrioritySchema>;
  requested: z.ZodDefault<z.ZodNumber>;
  declinedReason: z.ZodOptional<z.ZodString>;
}>;

export const wishFrontmatterSchema: WishFrontmatterSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema.default("medium"),
  requested: z.number().int().default(1),
  declinedReason: z.string().optional(),
});

export type WishFrontmatter = z.output<typeof wishFrontmatterSchema>;

type WishMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: typeof wishStatusSchema;
  priority: typeof wishPrioritySchema;
  requested: z.ZodNumber;
  slug: z.ZodString;
}>;

/**
 * Wish metadata schema - derived from frontmatter via .pick()
 * Only includes fields needed for fast DB queries/filtering.
 */
export const wishMetadataSchema: WishMetadataSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema,
  requested: z.number().int(),
  slug: z.string(),
});

export type WishMetadata = z.output<typeof wishMetadataSchema>;

/**
 * Wish entity schema
 */
export const wishSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"wish">;
    metadata: WishMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("wish"),
  metadata: wishMetadataSchema,
});

export type WishEntity = z.output<typeof wishSchema>;
