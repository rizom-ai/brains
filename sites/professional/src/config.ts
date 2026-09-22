import { z } from "@brains/utils/zod";

export interface EntityDisplayItem {
  label: string;
  pluralName?: string | undefined;
}

export interface ProfessionalSiteConfig {
  homepageOpening: boolean;
  entityDisplay: {
    post: EntityDisplayItem;
    deck: EntityDisplayItem;
  };
}

export interface ProfessionalSiteConfigInput {
  homepageOpening?: boolean | undefined;
  entityDisplay?:
    | {
        post: EntityDisplayItem;
        deck: EntityDisplayItem;
      }
    | undefined;
}

const entityDisplayItemSchema: z.ZodType<EntityDisplayItem, EntityDisplayItem> =
  z.object({
    label: z.string().describe("Display label for entity type (e.g., 'Essay')"),
    pluralName: z
      .string()
      .optional()
      .describe("URL path segment (defaults to label.toLowerCase() + 's')"),
  });

export const professionalSiteDefaultEntityDisplay: ProfessionalSiteConfig["entityDisplay"] =
  {
    post: { label: "Post" },
    deck: { label: "Deck" },
  };

export const professionalSiteConfigSchema: z.ZodType<
  ProfessionalSiteConfig,
  ProfessionalSiteConfigInput
> = z.object({
  homepageOpening: z
    .boolean()
    .default(false)
    .describe(
      "Opt in to the authored contact-first homepage; requires public Ask content and a matching contact endpoint",
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
