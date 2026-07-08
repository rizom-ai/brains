import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Pillar schema — a core principle of the platform
 */
type PillarSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
}>;

export const pillarSchema: PillarSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Pillar = z.output<typeof pillarSchema>;

/**
 * Benefit schema — a key advantage of the platform
 */
type BenefitSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
}>;

export const benefitSchema: BenefitSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Benefit = z.output<typeof benefitSchema>;

/**
 * Technology choice schema — a technical decision and its rationale
 */
type TechnologySchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
}>;

export const technologySchema: TechnologySchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type Technology = z.output<typeof technologySchema>;

/**
 * CTA schema — call to action with separate heading and button text
 */
type CtaSchema = z.ZodObject<{
  heading: z.ZodString;
  buttonText: z.ZodString;
  link: z.ZodString;
}>;

export const ctaSchema: CtaSchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  link: z.string(),
});

export type CTA = z.output<typeof ctaSchema>;

/**
 * Overview frontmatter schema (stored in YAML header)
 * Compact identity fields for the products overview page
 */
type OverviewFrontmatterSchema = z.ZodObject<{
  headline: z.ZodString;
  tagline: z.ZodString;
}>;

export const overviewFrontmatterSchema: OverviewFrontmatterSchema = z.object({
  headline: z.string(),
  tagline: z.string(),
});

export type OverviewFrontmatter = z.output<typeof overviewFrontmatterSchema>;

/**
 * Approach step schema — a how-it-works step
 */
type ApproachStepSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
}>;

export const approachStepSchema: ApproachStepSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type ApproachStep = z.output<typeof approachStepSchema>;

/**
 * Overview body schema (parsed from structured content sections)
 * Rich multi-section content: vision, pillars, approach, technologies, benefits, CTA
 */
type OverviewBodySchema = z.ZodObject<{
  vision: z.ZodString;
  pillars: z.ZodArray<PillarSchema>;
  approach: z.ZodArray<ApproachStepSchema>;
  productsIntro: z.ZodString;
  technologies: z.ZodArray<TechnologySchema>;
  benefits: z.ZodArray<BenefitSchema>;
  cta: CtaSchema;
}>;

export const overviewBodySchema: OverviewBodySchema = z.object({
  vision: z.string(),
  pillars: z.array(pillarSchema).min(1).max(6),
  approach: z.array(approachStepSchema).min(1).max(6),
  productsIntro: z.string(),
  technologies: z.array(technologySchema).min(1).max(6),
  benefits: z.array(benefitSchema).min(1).max(6),
  cta: ctaSchema,
});

export type OverviewBody = z.output<typeof overviewBodySchema>;

/**
 * Overview metadata schema — derived from frontmatter
 * Only includes fields needed for fast DB queries
 */
type OverviewMetadataSchema = z.ZodObject<{
  headline: z.ZodString;
  slug: z.ZodString;
}>;

export const overviewMetadataSchema: OverviewMetadataSchema =
  overviewFrontmatterSchema
    .pick({
      headline: true,
    })
    .extend({
      slug: z.string(),
    });

export type OverviewMetadata = z.output<typeof overviewMetadataSchema>;

const overviewEntityMetadataParserSchema: OverviewMetadataSchema = z.object({
  headline: z.string(),
  slug: z.string(),
});

const overviewFrontmatterParserSchema: OverviewFrontmatterSchema = z.object({
  headline: z.string(),
  tagline: z.string(),
});

/**
 * Overview entity schema (extends BaseEntity)
 */
export const overviewSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"products-overview">;
    metadata: OverviewMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("products-overview"),
  metadata: overviewEntityMetadataParserSchema,
});

export type Overview = z.output<typeof overviewSchema>;

/**
 * Overview with parsed data (returned by datasource)
 */
export const overviewWithDataSchema: ReturnType<
  typeof overviewSchema.extend<{
    frontmatter: OverviewFrontmatterSchema;
    body: OverviewBodySchema;
    labels: z.ZodRecord<z.ZodString, z.ZodString>;
  }>
> = overviewSchema.extend({
  frontmatter: overviewFrontmatterParserSchema,
  body: overviewBodySchema,
  labels: z.record(z.string(), z.string()),
});

export type OverviewWithData = z.output<typeof overviewWithDataSchema>;
