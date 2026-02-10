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
 * CTA schema — call to action
 */
export const ctaSchema = z.object({
  text: z.string(),
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
 * Overview body schema (parsed from structured content sections)
 * Rich multi-section content: vision, pillars, technologies, benefits, CTA
 */
export const overviewBodySchema = z.object({
  vision: z.string(),
  pillars: z.array(pillarSchema).min(1).max(6),
  productsIntro: z.string(),
  technologies: z.array(z.string()).min(1),
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
