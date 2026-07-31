import { z } from "@brains/utils/zod";
import type { ProjectStatus } from "../schemas/project";

interface ProjectViewFrontmatter {
  title: string;
  slug: string | null;
  status: ProjectStatus;
  publishedAt: string | null;
  description: string;
  year: number;
  coverImageId: string | null;
  ogImageId: string | null;
  url: string | null;
}

interface ProjectViewMetadata {
  title: string;
  status: ProjectStatus;
  publishedAt: string | null;
  year: number;
  slug: string;
  error: string | null;
}

interface ProjectViewContent {
  context: string;
  problem: string;
  solution: string;
  outcome: string;
}

export interface ProjectSchemaData {
  id: string;
  entityType: "project";
  content: string;
  created: string;
  updated: string;
  visibility: "public" | "shared" | "restricted";
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
}

const statusSchema = z.enum(["generating", "draft", "published", "failed"]);
const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);
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
  slug: nullableString,
  status: statusSchema,
  publishedAt: nullableString,
  description: z.string(),
  year: z.number(),
  coverImageId: nullableString,
  ogImageId: nullableString,
  url: z.url().nullable().default(null),
});
const metadataSchema = z.object({
  title: z.string(),
  status: statusSchema,
  publishedAt: nullableString,
  year: z.number(),
  slug: z.string(),
  error: nullableString,
});
const contentSchema = z.object({
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

export const projectViewSchema: z.ZodType<ProjectSchemaData> = z.object({
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
  url: nullableString,
  typeLabel: nullableString,
  coverImageUrl: nullableString,
  ogImageUrl: nullableString,
  coverImageWidth: nullableNumber,
  coverImageHeight: nullableNumber,
});

export type ProjectView = Omit<ProjectSchemaData, "url" | "typeLabel"> & {
  url: string;
  typeLabel: string;
};
