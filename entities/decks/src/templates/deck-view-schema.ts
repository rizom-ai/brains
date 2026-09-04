import { z } from "@brains/utils/zod";
import { deckStatusSchema } from "../schemas/deck";

type Visibility = "public" | "shared" | "restricted";
const visibilitySchema: z.ZodPipe<
  z.ZodOptional<
    z.ZodUnion<
      readonly [
        z.ZodEnum<{
          public: "public";
          shared: "shared";
          restricted: "restricted";
        }>,
        z.ZodLiteral<"private">,
      ]
    >
  >,
  z.ZodTransform<Visibility, Visibility | "private" | undefined>
> = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });

const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  author: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof deckStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  event: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
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

const metadataSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof deckStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  slug: z.ZodString;
  error: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  description: z.string().nullable().default(null),
  status: deckStatusSchema,
  publishedAt: z.string().nullable().default(null),
  coverImageId: z.string().nullable().default(null),
  slug: z.string(),
  error: z.string().nullable().default(null),
});

export const deckViewSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"deck">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof visibilitySchema;
  metadata: typeof metadataSchema;
  contentHash: z.ZodString;
  frontmatter: typeof frontmatterSchema;
  body: z.ZodString;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  typeLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  listUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  listLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageWidth: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  coverImageHeight: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
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
  url: z.string().nullable().default(null),
  typeLabel: z.string().nullable().default(null),
  listUrl: z.string().nullable().default(null),
  listLabel: z.string().nullable().default(null),
  coverImageUrl: z.string().nullable().default(null),
  ogImageUrl: z.string().nullable().default(null),
  coverImageWidth: z.number().nullable().default(null),
  coverImageHeight: z.number().nullable().default(null),
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
