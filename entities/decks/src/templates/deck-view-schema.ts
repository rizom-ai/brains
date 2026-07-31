import { z } from "@brains/utils/zod";
import { deckStatusSchema, type DeckStatus } from "../schemas/deck";

interface DeckViewFrontmatter {
  title: string;
  slug: string | null;
  description: string | null;
  author: string | null;
  status: DeckStatus;
  publishedAt: string | null;
  event: string | null;
  coverImageId: string | null;
  ogImageId: string | null;
}

interface DeckViewMetadata {
  title: string;
  description: string | null;
  status: DeckStatus;
  publishedAt: string | null;
  coverImageId: string | null;
  slug: string;
  error: string | null;
}

export interface DeckSchemaData {
  id: string;
  entityType: "deck";
  content: string;
  created: string;
  updated: string;
  visibility: "public" | "shared" | "restricted";
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
}

const visibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const frontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  status: deckStatusSchema,
  publishedAt: z.string().nullable().default(null),
  event: z.string().nullable().default(null),
  coverImageId: z.string().nullable().default(null),
  ogImageId: z.string().nullable().default(null),
});

const metadataSchema = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  status: deckStatusSchema,
  publishedAt: z.string().nullable().default(null),
  coverImageId: z.string().nullable().default(null),
  slug: z.string(),
  error: z.string().nullable().default(null),
});

export const deckViewSchema: z.ZodType<DeckSchemaData> = z.object({
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
  url: z.string().nullable().default(null),
  typeLabel: z.string().nullable().default(null),
  listUrl: z.string().nullable().default(null),
  listLabel: z.string().nullable().default(null),
  coverImageUrl: z.string().nullable().default(null),
  ogImageUrl: z.string().nullable().default(null),
  coverImageWidth: z.number().nullable().default(null),
  coverImageHeight: z.number().nullable().default(null),
});

export type DeckView = Omit<
  DeckSchemaData,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
