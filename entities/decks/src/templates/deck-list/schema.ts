import { z } from "@brains/utils/zod-v4";

type DeckStatusSchema = z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}>;

const deckStatusSchema: DeckStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

type DeckFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  author: z.ZodOptional<z.ZodString>;
  status: DeckStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  event: z.ZodOptional<z.ZodString>;
  coverImageId: z.ZodOptional<z.ZodString>;
  ogImageId: z.ZodOptional<z.ZodString>;
}>;

const deckFrontmatterSchema: DeckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusSchema,
  publishedAt: z.string().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(),
  ogImageId: z.string().optional(),
});

type DeckMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  status: DeckStatusSchema;
  publishedAt: z.ZodOptional<z.ZodString>;
  coverImageId: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
}>;

const deckMetadataSchema: DeckMetadataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: deckStatusSchema,
  publishedAt: z.string().optional(),
  coverImageId: z.string().optional(),
  slug: z.string(),
  error: z.string().optional(),
});

type ContentVisibilitySchema = z.ZodEnum<{
  public: "public";
  shared: "shared";
  restricted: "restricted";
}>;

const contentVisibilitySchema: ContentVisibilitySchema = z.enum([
  "public",
  "shared",
  "restricted",
]);

type DeckWithDataSchema = z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"deck">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: ContentVisibilitySchema;
  metadata: DeckMetadataSchema;
  contentHash: z.ZodString;
  frontmatter: DeckFrontmatterSchema;
  body: z.ZodString;
  ogImageUrl: z.ZodOptional<z.ZodString>;
}>;

export const deckWithDataSchema: DeckWithDataSchema = z.object({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: deckMetadataSchema,
  contentHash: z.string(),
  frontmatter: deckFrontmatterSchema,
  body: z.string(),
  ogImageUrl: z.string().optional(),
});

export const enrichedDeckSchema: ReturnType<
  typeof deckWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
    listUrl: z.ZodOptional<z.ZodString>;
    listLabel: z.ZodOptional<z.ZodString>;
    coverImageUrl: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
    coverImageWidth: z.ZodOptional<z.ZodNumber>;
    coverImageHeight: z.ZodOptional<z.ZodNumber>;
  }>
> = deckWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema: z.ZodObject<{
  decks: z.ZodArray<DeckWithDataSchema>;
}> = z.object({
  decks: z.array(deckWithDataSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof enrichedDeckSchema>;
  pageTitle: z.ZodOptional<z.ZodString>;
  pageLabel: z.ZodOptional<z.ZodString>;
}> = z.object({
  decks: z.array(enrichedDeckSchema),
  pageTitle: z.string().optional(),
  pageLabel: z.string().optional(),
});

export type DeckListData = z.output<typeof deckListSchema>;
export type EnrichedDeck = Omit<
  z.output<typeof enrichedDeckSchema>,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};

export interface EnrichedDeckListData {
  decks: EnrichedDeck[];
  pageTitle?: string;
  pageLabel?: string;
}
