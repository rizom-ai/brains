import { z } from "@brains/utils/zod-v4";

const entityDisplayItemSchema = z.object({
  label: z.string().describe("Display label for entity type (e.g., 'Essay')"),
  pluralName: z
    .string()
    .optional()
    .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
});

export const professionalSiteDefaultEntityDisplay = {
  post: { label: "Post" },
  deck: { label: "Deck" },
};

export const professionalSiteConfigSchema = z.object({
  entityDisplay: z
    .object({
      post: entityDisplayItemSchema,
      deck: entityDisplayItemSchema,
    })
    .default(professionalSiteDefaultEntityDisplay)
    .describe(
      "Display metadata for post and deck entity types used by the homepage",
    ),
});

export type ProfessionalSiteConfig = z.output<
  typeof professionalSiteConfigSchema
>;

export type ProfessionalSiteConfigInput = z.input<
  typeof professionalSiteConfigSchema
>;
