import { z } from "@brains/utils";

const entityRouteItemSchema = z.object({
  label: z.string().describe("Display label for entity type (e.g., 'Essay')"),
  pluralName: z
    .string()
    .optional()
    .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
});

export const professionalSiteConfigSchema = z.object({
  entityRouteConfig: z
    .object({
      post: entityRouteItemSchema,
      deck: entityRouteItemSchema,
    })
    .describe(
      "Route configuration for post and deck entity types (required for homepage)",
    ),
});

export type ProfessionalSiteConfig = z.infer<
  typeof professionalSiteConfigSchema
>;
