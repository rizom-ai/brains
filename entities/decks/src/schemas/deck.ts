import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";
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

const deckStatusParserSchema = z4.enum([
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

const deckEntityMetadataParserSchema = z4
  .object({
    title: z4.string(),
    description: z4.string().optional(),
    status: deckStatusParserSchema,
    publishedAt: z4.string().datetime().optional(),
    coverImageId: z4.string().optional(),
    slug: z4.string(),
    error: z4.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isMissingPublishedAt(data)) return;
    ctx.addIssue({
      code: "custom",
      path: ["publishedAt"],
      message: publishedAtRequiredMessage,
    });
  });

const deckFrontmatterParserSchema = z4.object({
  title: z4.string(),
  slug: z4.string().optional(),
  description: z4.string().optional(),
  author: z4.string().optional(),
  status: deckStatusParserSchema,
  publishedAt: z4.string().datetime().optional(),
  event: z4.string().optional(),
  coverImageId: z4.string().optional(),
  ogImageId: z4.string().optional(),
});

/**
 * Deck entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + slide content
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const deckSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("deck"),
  metadata: deckEntityMetadataParserSchema,
});

export type DeckEntity = z4.output<typeof deckSchema>;

/**
 * Deck with parsed frontmatter data (returned by datasource)
 * Extends DeckEntity with parsed frontmatter and body (markdown without frontmatter)
 */
export const deckWithDataSchema = deckSchema.extend({
  frontmatter: deckFrontmatterParserSchema,
  body: z4.string(),
  ogImageUrl: z4.string().optional(),
});

export type DeckWithData = z4.output<typeof deckWithDataSchema>;

/**
 * Enriched deck schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 */
export const enrichedDeckSchema = deckWithDataSchema.extend({
  url: z4.string().optional(),
  typeLabel: z4.string().optional(),
  listUrl: z4.string().optional(),
  listLabel: z4.string().optional(),
  coverImageUrl: z4.string().optional(),
  ogImageUrl: z4.string().optional(),
  coverImageWidth: z4.number().optional(),
  coverImageHeight: z4.number().optional(),
});

/**
 * Enriched deck type (used by components)
 * All enrichment fields are required - always present after enrichment
 */
export type EnrichedDeck = Omit<
  z4.output<typeof enrichedDeckSchema>,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
