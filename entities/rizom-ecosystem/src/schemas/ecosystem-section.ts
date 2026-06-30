import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

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

export type EcosystemContent = z.output<typeof ecosystemContentSchema>;

export const ecosystemSectionMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
});

export type EcosystemSectionMetadata = z.output<
  typeof ecosystemSectionMetadataSchema
>;

const ecosystemSectionEntityMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
});

export const ecosystemSectionSchema = baseEntityParserSchema.extend({
  entityType: z.literal("ecosystem-section"),
  metadata: ecosystemSectionEntityMetadataSchema,
});

export type EcosystemSection = z.output<typeof ecosystemSectionSchema>;
