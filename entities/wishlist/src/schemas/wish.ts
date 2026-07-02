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
export type WishStatus =
  | "new"
  | "planned"
  | "in-progress"
  | "done"
  | "declined";

export const wishStatusSchema: z.ZodType<WishStatus, WishStatus> = z.enum([
  "new",
  "planned",
  "in-progress",
  "done",
  "declined",
]);

export type WishPriority = "low" | "medium" | "high" | "critical";

export const wishPrioritySchema: z.ZodType<WishPriority, WishPriority> = z.enum(
  ["low", "medium", "high", "critical"],
);

const wishStatusParserSchema: z.ZodType<WishStatus, WishStatus> = z.enum([
  "new",
  "planned",
  "in-progress",
  "done",
  "declined",
]);
const wishPriorityParserSchema: z.ZodType<WishPriority, WishPriority> = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export interface WishFrontmatter {
  [key: string]: unknown;
  title: string;
  status: WishStatus;
  priority: WishPriority;
  requested: number;
  declinedReason?: string | undefined;
}

/**
 * Wish frontmatter schema (stored in content as YAML frontmatter)
 * Body contains the description of what the user wanted.
 */
type WishFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodType<WishStatus, WishStatus>;
  priority: z.ZodDefault<z.ZodType<WishPriority, WishPriority>>;
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

export interface WishMetadata {
  [key: string]: unknown;
  title: string;
  status: WishStatus;
  priority: WishPriority;
  requested: number;
  slug: string;
}

type WishMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodType<WishStatus, WishStatus>;
  priority: z.ZodType<WishPriority, WishPriority>;
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

/**
 * Wish entity schema
 */
const wishEntityMetadataParserSchema: WishMetadataSchema = z.object({
  title: z.string(),
  status: wishStatusParserSchema,
  priority: wishPriorityParserSchema,
  requested: z.number().int(),
  slug: z.string(),
});

export const wishSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"wish">;
    metadata: WishMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("wish"),
  metadata: wishEntityMetadataParserSchema,
});

export type WishEntity = z.output<typeof wishSchema>;
