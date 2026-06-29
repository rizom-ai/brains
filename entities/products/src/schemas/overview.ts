import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Pillar schema — a core principle of the platform
 */
export const pillarSchema = z4.object({
  title: z4.string(),
  description: z4.string(),
});

export type Pillar = z4.output<typeof pillarSchema>;

/**
 * Benefit schema — a key advantage of the platform
 */
export const benefitSchema = z4.object({
  title: z4.string(),
  description: z4.string(),
});

export type Benefit = z4.output<typeof benefitSchema>;

/**
 * Technology choice schema — a technical decision and its rationale
 */
export const technologySchema = z4.object({
  title: z4.string(),
  description: z4.string(),
});

export type Technology = z4.output<typeof technologySchema>;

/**
 * CTA schema — call to action with separate heading and button text
 */
export const ctaSchema = z4.object({
  heading: z4.string(),
  buttonText: z4.string(),
  link: z4.string(),
});

export type CTA = z4.output<typeof ctaSchema>;

/**
 * Overview frontmatter schema (stored in YAML header)
 * Compact identity fields for the products overview page
 */
export const overviewFrontmatterSchema = z.object({
  headline: z.string(),
  tagline: z.string(),
});

export type OverviewFrontmatter = z.output<typeof overviewFrontmatterSchema>;

/**
 * Approach step schema — a how-it-works step
 */
export const approachStepSchema = z4.object({
  title: z4.string(),
  description: z4.string(),
});

export type ApproachStep = z4.output<typeof approachStepSchema>;

/**
 * Overview body schema (parsed from structured content sections)
 * Rich multi-section content: vision, pillars, approach, technologies, benefits, CTA
 */
export const overviewBodySchema = z4.object({
  vision: z4.string(),
  pillars: z4.array(pillarSchema).min(1).max(6),
  approach: z4.array(approachStepSchema).min(1).max(6),
  productsIntro: z4.string(),
  technologies: z4.array(technologySchema).min(1).max(6),
  benefits: z4.array(benefitSchema).min(1).max(6),
  cta: ctaSchema,
});

export type OverviewBody = z4.output<typeof overviewBodySchema>;

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

export type OverviewMetadata = z.output<typeof overviewMetadataSchema>;

const overviewEntityMetadataParserSchema = z4.object({
  headline: z4.string(),
  slug: z4.string(),
});

const overviewFrontmatterParserSchema = z4.object({
  headline: z4.string(),
  tagline: z4.string(),
});

/**
 * Overview entity schema (extends BaseEntity)
 */
export const overviewSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("products-overview"),
  metadata: overviewEntityMetadataParserSchema,
});

export type Overview = z4.output<typeof overviewSchema>;

/**
 * Overview with parsed data (returned by datasource)
 */
export const overviewWithDataSchema = overviewSchema.extend({
  frontmatter: overviewFrontmatterParserSchema,
  body: overviewBodySchema,
  labels: z4.record(z4.string(), z4.string()),
});

export type OverviewWithData = z4.output<typeof overviewWithDataSchema>;
