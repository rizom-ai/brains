import { z } from "@brains/utils/zod";
import type { ProjectStatus } from "../schemas/project";

// The schemas are the source of truth; every type here is derived from one
// with z.output. That also gives the rendered shapes the implicit index
// signature JsonObject requires, which a hand-written interface would not
// have.

type Visibility = "public" | "shared" | "restricted";

const statusSchema: z.ZodType<ProjectStatus> = z.enum([
  "generating",
  "draft",
  "published",
  "failed",
]);

const nullableString = (): z.ZodType<
  string | null,
  string | null | undefined
> => z.string().nullable().default(null);

const nullableNumber = (): z.ZodType<
  number | null,
  number | null | undefined
> => z.number().nullable().default(null);

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

const frontmatterSchema: z.ZodType<{
  title: string;
  slug: string | null;
  status: ProjectStatus;
  publishedAt: string | null;
  description: string;
  year: number;
  coverImageId: string | null;
  ogImageId: string | null;
  url: string | null;
}> = z.object({
  title: z.string(),
  slug: nullableString(),
  status: statusSchema,
  publishedAt: nullableString(),
  description: z.string(),
  year: z.number(),
  coverImageId: nullableString(),
  ogImageId: nullableString(),
  url: z.url().nullable().default(null),
});

export type ProjectViewFrontmatter = z.output<typeof frontmatterSchema>;

const metadataSchema: z.ZodType<{
  title: string;
  status: ProjectStatus;
  publishedAt: string | null;
  year: number;
  slug: string;
  error: string | null;
}> = z.object({
  title: z.string(),
  status: statusSchema,
  publishedAt: nullableString(),
  year: z.number(),
  slug: z.string(),
  error: nullableString(),
});

export type ProjectViewMetadata = z.output<typeof metadataSchema>;

const contentSchema: z.ZodType<{
  context: string;
  problem: string;
  solution: string;
  outcome: string;
}> = z.object({
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

export type ProjectViewContent = z.output<typeof contentSchema>;

export const projectViewSchema: z.ZodType<{
  id: string;
  entityType: "project";
  content: string;
  created: string;
  updated: string;
  visibility: Visibility;
  metadata: ProjectViewMetadata;
  contentHash: string;
  frontmatter: ProjectViewFrontmatter;
  body: string;
  structuredContent: ProjectViewContent | null;
  url: string | null;
  typeLabel: string | null;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
  coverImageWidth: number | null;
  coverImageHeight: number | null;
}> = z.object({
  id: z.string(),
  entityType: z.literal("project"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  body: z.string(),
  structuredContent: contentSchema.nullable().default(null),
  url: nullableString(),
  typeLabel: nullableString(),
  coverImageUrl: nullableString(),
  ogImageUrl: nullableString(),
  coverImageWidth: nullableNumber(),
  coverImageHeight: nullableNumber(),
});

export type ProjectSchemaData = z.output<typeof projectViewSchema>;

export type ProjectView = Omit<ProjectSchemaData, "url" | "typeLabel"> & {
  url: string;
  typeLabel: string;
};
