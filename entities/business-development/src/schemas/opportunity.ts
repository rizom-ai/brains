import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

export const opportunityTypeSchema = z.enum([
  "commercial",
  "grant",
  "partnership",
  "internal",
]);

export const opportunityStateSchema = z.enum([
  "active",
  "staged",
  "warm",
  "closed",
]);

export const opportunityScoreSchema = z.number().int().min(0).max(5);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

export const opportunityFrontmatterSchema = z.object({
  title: z.string().min(1),
  type: opportunityTypeSchema,
  state: opportunityStateSchema,
  incomePotential: opportunityScoreSchema,
  organizationalBuild: opportunityScoreSchema,
  brainsDevelopment: opportunityScoreSchema,
  integrity: opportunityScoreSchema,
  owner: z.string().min(1).optional(),
  hardDeadline: dateStringSchema.optional(),
  lastActionAt: dateStringSchema.optional(),
  lastActionBy: z.string().min(1).optional(),
});

export const opportunityMetadataSchema = opportunityFrontmatterSchema.extend({
  slug: z.string(),
});

export const opportunitySchema = baseEntitySchema.extend({
  entityType: z.literal("opportunity"),
  metadata: opportunityMetadataSchema,
});

export const opportunityConfigSchema = z.object({});

export type OpportunityType = z.infer<typeof opportunityTypeSchema>;
export type OpportunityState = z.infer<typeof opportunityStateSchema>;
export type OpportunityFrontmatter = z.infer<
  typeof opportunityFrontmatterSchema
>;
export type OpportunityMetadata = z.infer<typeof opportunityMetadataSchema>;
export type OpportunityEntity = z.infer<typeof opportunitySchema>;
export type OpportunityConfig = z.infer<typeof opportunityConfigSchema>;
