import { z } from "@brains/sdk/entities";
import { deckStatusSchema, type DeckStatus } from "../schemas/deck";

// The schemas are the source of truth; every type here is derived from one
// with z.output. That also gives the rendered shapes the implicit index
// signature JsonObject requires, which a hand-written interface would not
// have — so deriving is what keeps these renderable, not a style choice.

type Visibility = "public" | "shared" | "restricted";

const visibilitySchema: z.ZodType<
  Visibility,
  Visibility | "private" | undefined
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const nullableString = (): z.ZodType<
  string | null,
  string | null | undefined
> => z.string().nullable().default(null);

const nullableNumber = (): z.ZodType<
  number | null,
  number | null | undefined
> => z.number().nullable().default(null);

const frontmatterSchema: z.ZodType<{
  title: string;
  slug: string | null;
  description: string | null;
  author: string | null;
  status: DeckStatus;
  publishedAt: string | null;
  event: string | null;
  coverImageId: string | null;
  ogImageId: string | null;
}> = z.object({
  title: z.string(),
  slug: nullableString(),
  description: nullableString(),
  author: nullableString(),
  status: deckStatusSchema,
  publishedAt: nullableString(),
  event: nullableString(),
  coverImageId: nullableString(),
  ogImageId: nullableString(),
});

export type DeckViewFrontmatter = z.output<typeof frontmatterSchema>;

const metadataSchema: z.ZodType<{
  title: string;
  description: string | null;
  status: DeckStatus;
  publishedAt: string | null;
  coverImageId: string | null;
  slug: string;
  error: string | null;
}> = z.object({
  title: z.string(),
  description: nullableString(),
  status: deckStatusSchema,
  publishedAt: nullableString(),
  coverImageId: nullableString(),
  slug: z.string(),
  error: nullableString(),
});

export type DeckViewMetadata = z.output<typeof metadataSchema>;

export const deckViewSchema: z.ZodType<{
  id: string;
  entityType: "deck";
  content: string;
  created: string;
  updated: string;
  visibility: Visibility;
  metadata: DeckViewMetadata;
  contentHash: string;
  frontmatter: DeckViewFrontmatter;
  body: string;
  url: string | null;
  typeLabel: string | null;
  listUrl: string | null;
  listLabel: string | null;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  coverImageWidth: number | null;
  coverImageHeight: number | null;
}> = z.object({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  url: nullableString(),
  typeLabel: nullableString(),
  listUrl: nullableString(),
  listLabel: nullableString(),
  coverImageUrl: nullableString(),
  ogImageUrl: nullableString(),
  coverImageWidth: nullableNumber(),
  coverImageHeight: nullableNumber(),
});

export type DeckSchemaData = z.output<typeof deckViewSchema>;

export type DeckView = Omit<
  DeckSchemaData,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
