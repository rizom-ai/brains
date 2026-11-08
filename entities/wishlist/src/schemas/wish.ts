import { z } from "@brains/sdk/entities";

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
  requested: z.number().int().default(1).meta({ studioWidget: "provenance" }),
  declinedReason: z.string().optional(),
});

export type WishFrontmatter = z.output<typeof wishFrontmatterSchema>;

type WishMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: typeof wishStatusSchema;
  priority: typeof wishPrioritySchema;
  requested: z.ZodNumber;
  slug: z.ZodOptional<z.ZodString>;
  declinedReason: z.ZodOptional<z.ZodString>;
}>;

/**
 * Wish metadata schema: the frontmatter, decoded, with the slug derived
 * from the title. Studio edits it, so it shows the request count as a fact
 * and hides the derived slug, as the frontmatter it edited did; the slug is
 * optional, since a wish's file never carries one and an edited wish
 * arrives without it, though every decoded wish has one.
 */
export const wishMetadataSchema: WishMetadataSchema = z.object({
  title: z.string(),
  status: wishStatusSchema,
  priority: wishPrioritySchema,
  requested: z.number().int().meta({ studioWidget: "provenance" }),
  slug: z.string().optional().meta({ studioWidget: "hidden" }),
  declinedReason: z.string().optional(),
});

export type WishMetadata = z.output<typeof wishMetadataSchema>;
