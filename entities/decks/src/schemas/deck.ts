import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Deck status
 */
export const deckStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
export type DeckStatus = z.output<typeof deckStatusSchema>;

const deckStatusParserSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

export const publishedAtRequiredMessage =
  "publishedAt is required when deck status is published";

interface PublishedAtCheckable {
  status: DeckStatus;
  publishedAt?: string | undefined;
}

const isMissingPublishedAt = (data: PublishedAtCheckable): boolean =>
  data.status === "published" && !data.publishedAt;

export const assertPublishedDeckHasPublishedAt = (
  data: PublishedAtCheckable,
): void => {
  if (isMissingPublishedAt(data)) {
    throw new Error(publishedAtRequiredMessage);
  }
};

/**
 * Deck frontmatter schema (stored in content as YAML frontmatter)
 * Contains all presentation data for human editing
 */
export const deckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusSchema,
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(), // References an image entity by ID
  ogImageId: z.string().optional(), // References an image entity for social previews
});

export type DeckFrontmatter = z.output<typeof deckFrontmatterSchema>;

/**
 * Deck metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const deckMetadataSchema = deckFrontmatterSchema
  .pick({
    title: true,
    description: true,
    status: true,
    publishedAt: true,
    coverImageId: true,
  })
  .extend({
    slug: z.string(), // Required in metadata (auto-generated from title)
    error: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isMissingPublishedAt(data)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publishedAt"],
      message: publishedAtRequiredMessage,
    });
  });

export type DeckMetadata = z.output<typeof deckMetadataSchema>;

const deckEntityMetadataParserSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    status: deckStatusParserSchema,
    publishedAt: z.string().datetime().optional(),
    coverImageId: z.string().optional(),
    slug: z.string(),
    error: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isMissingPublishedAt(data)) return;
    ctx.addIssue({
      code: "custom",
      path: ["publishedAt"],
      message: publishedAtRequiredMessage,
    });
  });

const deckFrontmatterParserSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusParserSchema,
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(),
  ogImageId: z.string().optional(),
});

/**
 * Deck entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + slide content
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const deckSchema = baseEntityParserSchema.extend({
  entityType: z.literal("deck"),
  metadata: deckEntityMetadataParserSchema,
});

export type DeckEntity = z.output<typeof deckSchema>;

/**
 * Deck with parsed frontmatter data (returned by datasource)
 * Extends DeckEntity with parsed frontmatter and body (markdown without frontmatter)
 */
export const deckWithDataSchema = deckSchema.extend({
  frontmatter: deckFrontmatterParserSchema,
  body: z.string(),
  ogImageUrl: z.string().optional(),
});

export type DeckWithData = z.output<typeof deckWithDataSchema>;

/**
 * Enriched deck schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 */
export const enrichedDeckSchema = deckWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Enriched deck type (used by components)
 * All enrichment fields are required - always present after enrichment
 */
export type EnrichedDeck = Omit<
  z.output<typeof enrichedDeckSchema>,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
