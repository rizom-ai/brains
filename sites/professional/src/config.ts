import { z } from "@brains/utils";

const entityDisplayItemSchema = z.object({
  label: z.string().describe("Display label for entity type (e.g., 'Essay')"),
  pluralName: z
    .string()
    .optional()
    .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
});

export const professionalSiteConfigSchema = z.object({
  entityDisplay: z
    .object({
      post: entityDisplayItemSchema,
      deck: entityDisplayItemSchema,
    })
    .describe(
      "Display metadata for post and deck entity types (required for homepage)",
    ),
});

export type ProfessionalSiteConfig = z.infer<
  typeof professionalSiteConfigSchema
>;

export type ProfessionalSiteConfigInput = Partial<ProfessionalSiteConfig>;
