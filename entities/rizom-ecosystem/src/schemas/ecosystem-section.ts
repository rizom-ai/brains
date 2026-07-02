import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export type EcosystemSuffix = "ai" | "foundation" | "work";

export const ecosystemSuffixSchema: z.ZodType<
  EcosystemSuffix,
  EcosystemSuffix
> = z.enum(["ai", "foundation", "work"]);

export interface EcosystemCard {
  suffix: EcosystemSuffix;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}

type EcosystemCardSchema = z.ZodObject<{
  suffix: z.ZodType<EcosystemSuffix, EcosystemSuffix>;
  title: z.ZodString;
  body: z.ZodString;
  linkLabel: z.ZodString;
  linkHref: z.ZodString;
}>;

export const ecosystemCardSchema: EcosystemCardSchema = z.object({
  suffix: ecosystemSuffixSchema,
  title: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
});

export interface EcosystemContent {
  eyebrow: string;
  headline: string;
  cards: EcosystemCard[];
}

export const ecosystemContentSchema: z.ZodType<EcosystemContent> = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  cards: z.array(ecosystemCardSchema).min(1),
});

export type EcosystemSectionStatus = "draft" | "published";

export interface EcosystemSectionMetadata {
  [key: string]: unknown;
  title: string;
  slug: string;
  status: EcosystemSectionStatus;
}

type EcosystemSectionMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  status: z.ZodEnum<{ draft: "draft"; published: "published" }>;
}>;

export const ecosystemSectionMetadataSchema: EcosystemSectionMetadataSchema =
  z.object({
    title: z.string(),
    slug: z.string(),
    status: z.enum(["draft", "published"]),
  });

const ecosystemSectionEntityMetadataSchema: EcosystemSectionMetadataSchema =
  z.object({
    title: z.string(),
    slug: z.string(),
    status: z.enum(["draft", "published"]),
  });

export const ecosystemSectionSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"ecosystem-section">;
    metadata: EcosystemSectionMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("ecosystem-section"),
  metadata: ecosystemSectionEntityMetadataSchema,
});

export type EcosystemSection = z.output<typeof ecosystemSectionSchema>;
