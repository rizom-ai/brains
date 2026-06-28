import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";

export const ecosystemSuffixSchema = z4.enum(["ai", "foundation", "work"]);

export const ecosystemCardSchema = z4.object({
  suffix: ecosystemSuffixSchema,
  title: z4.string(),
  body: z4.string(),
  linkLabel: z4.string(),
  linkHref: z4.string(),
});

export const ecosystemContentSchema = z4.object({
  eyebrow: z4.string(),
  headline: z4.string(),
  cards: z4.array(ecosystemCardSchema).min(1),
});

export type EcosystemContent = z4.output<typeof ecosystemContentSchema>;

export const ecosystemSectionMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
});

export type EcosystemSectionMetadata = z.output<
  typeof ecosystemSectionMetadataSchema
>;

const ecosystemSectionEntityMetadataSchema = z4.object({
  title: z4.string(),
  slug: z4.string(),
  status: z4.enum(["draft", "published"]),
});

export const ecosystemSectionSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("ecosystem-section"),
  metadata: ecosystemSectionEntityMetadataSchema,
});

export type EcosystemSection = z4.output<typeof ecosystemSectionSchema>;
