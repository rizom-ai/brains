import { contentVisibilitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { projectStatusSchema } from "../schemas/project";

const nullableString: z.ZodDefault<z.ZodNullable<z.ZodString>> = z
  .string()
  .nullable()
  .default(null);
const nullableNumber: z.ZodDefault<z.ZodNullable<z.ZodNumber>> = z
  .number()
  .nullable()
  .default(null);
const frontmatterSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  status: typeof projectStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  description: z.ZodString;
  year: z.ZodNumber;
  coverImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  url: z.ZodDefault<z.ZodNullable<z.ZodURL>>;
}> = z.object({
  title: z.string(),
  slug: nullableString,
  status: projectStatusSchema,
  publishedAt: nullableString,
  description: z.string(),
  year: z.number(),
  coverImageId: nullableString,
  ogImageId: nullableString,
  url: z.url().nullable().default(null),
});
const metadataSchema: z.ZodObject<{
  title: z.ZodString;
  status: typeof projectStatusSchema;
  publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  year: z.ZodNumber;
  slug: z.ZodString;
  error: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string(),
  status: projectStatusSchema,
  publishedAt: nullableString,
  year: z.number(),
  slug: z.string(),
  error: nullableString,
});
const contentSchema: z.ZodObject<{
  context: z.ZodString;
  problem: z.ZodString;
  solution: z.ZodString;
  outcome: z.ZodString;
}> = z.object({
  context: z.string(),
  problem: z.string(),
  solution: z.string(),
  outcome: z.string(),
});

export const projectViewSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"project">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof contentVisibilitySchema;
  metadata: typeof metadataSchema;
  contentHash: z.ZodString;
  frontmatter: typeof frontmatterSchema;
  body: z.ZodString;
  structuredContent: z.ZodDefault<z.ZodNullable<typeof contentSchema>>;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  typeLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ogImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  coverImageWidth: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  coverImageHeight: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
}> = z.object({
  id: z.string(),
  entityType: z.literal("project"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
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

export type ProjectSchemaData = z.output<typeof projectViewSchema>;

export type ProjectView = Omit<ProjectSchemaData, "url" | "typeLabel"> & {
  url: string;
  typeLabel: string;
};
