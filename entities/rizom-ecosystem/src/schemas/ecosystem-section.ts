import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";

export const ecosystemSuffixSchema = z.enum(["ai", "foundation", "work"]);

export const ecosystemCardSchema = z.object({
  suffix: ecosystemSuffixSchema,
  title: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
});

export const ecosystemContentSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  cards: z.array(ecosystemCardSchema).min(1),
});

export type EcosystemContent = z.infer<typeof ecosystemContentSchema>;

export const ecosystemSectionMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
});

export type EcosystemSectionMetadata = z.infer<
  typeof ecosystemSectionMetadataSchema
>;

export const ecosystemSectionSchema = baseEntitySchema.extend({
  entityType: z.literal("ecosystem-section"),
  metadata: ecosystemSectionMetadataSchema,
});

export type EcosystemSection = z.infer<typeof ecosystemSectionSchema>;
