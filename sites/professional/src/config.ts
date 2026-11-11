import { z } from "@brains/utils/zod";

type EntityDisplayItemSchema = z.ZodObject<{
  label: z.ZodString;
  pluralName: z.ZodOptional<z.ZodString>;
}>;

const entityDisplayItemSchema: EntityDisplayItemSchema = z.object({
  label: z.string().describe("Display label for entity type (e.g., 'Essay')"),
  pluralName: z
    .string()
    .optional()
    .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
});

export type EntityDisplayItem = z.output<typeof entityDisplayItemSchema>;

export const professionalSiteDefaultEntityDisplay: ProfessionalSiteConfig["entityDisplay"] =
  {
    post: { label: "Post" },
    deck: { label: "Deck" },
  };

export const professionalSiteConfigSchema: z.ZodObject<{
  homepageOpening: z.ZodDefault<z.ZodBoolean>;
  entityDisplay: z.ZodDefault<
    z.ZodObject<{
      post: EntityDisplayItemSchema;
      deck: EntityDisplayItemSchema;
    }>
  >;
}> = z.object({
  homepageOpening: z
    .boolean()
    .default(false)
    .describe(
      "Opt in to the atlas homepage: the authored opening and contact door over a map of published work; requires public Ask content and a matching contact endpoint",
    ),
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
