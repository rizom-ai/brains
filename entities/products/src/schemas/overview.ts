import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Pillar schema — a core principle of the platform
 */
export const pillarSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Pillar = z.infer<typeof pillarSchema>;

/**
 * Benefit schema — a key advantage of the platform
 */
export const benefitSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Benefit = z.infer<typeof benefitSchema>;

/**
 * Technology choice schema — a technical decision and its rationale
 */
export const technologySchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Technology = z.infer<typeof technologySchema>;

/**
 * CTA schema — call to action with separate heading and button text
 */
export const ctaSchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  link: z.string(),
});

export type CTA = z.infer<typeof ctaSchema>;

/**
 * Overview frontmatter schema (stored in YAML header)
 * Compact identity fields for the products overview page
 */
export const overviewFrontmatterSchema = z.object({
  headline: z.string(),
  tagline: z.string(),
});

export type OverviewFrontmatter = z.infer<typeof overviewFrontmatterSchema>;

/**
 * Approach step schema — a how-it-works step
 */
export const approachStepSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type ApproachStep = z.infer<typeof approachStepSchema>;

/**
 * Overview body schema (parsed from structured content sections)
 * Rich multi-section content: vision, pillars, approach, technologies, benefits, CTA
 */
export const overviewBodySchema = z.object({
  vision: z.string(),
  pillars: z.array(pillarSchema).min(1).max(6),
  approach: z.array(approachStepSchema).min(1).max(6),
  productsIntro: z.string(),
  technologies: z.array(technologySchema).min(1).max(6),
  benefits: z.array(benefitSchema).min(1).max(6),
  cta: ctaSchema,
});

export type OverviewBody = z.infer<typeof overviewBodySchema>;

/**
 * Overview metadata schema — derived from frontmatter
 * Only includes fields needed for fast DB queries
 */
export const overviewMetadataSchema = overviewFrontmatterSchema
  .pick({
    headline: true,
  })
  .extend({
    slug: z.string(),
  });

export type OverviewMetadata = z.infer<typeof overviewMetadataSchema>;

/**
 * Overview entity schema (extends BaseEntity)
 */
export const overviewSchema = baseEntitySchema.extend({
  entityType: z.literal("products-overview"),
  metadata: overviewMetadataSchema,
});

export type Overview = z.infer<typeof overviewSchema>;

/**
 * Overview with parsed data (returned by datasource)
 */
export const overviewWithDataSchema = overviewSchema.extend({
  frontmatter: overviewFrontmatterSchema,
  body: overviewBodySchema,
  labels: z.record(z.string(), z.string()),
});

export type OverviewWithData = z.infer<typeof overviewWithDataSchema>;
