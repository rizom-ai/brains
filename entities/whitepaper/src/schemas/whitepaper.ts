import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

export const whitepaperStatusSchema = z.enum([
  "idea",
  "outline",
  "draft",
  "review",
  "published",
]);
export type WhitepaperStatus = z.infer<typeof whitepaperStatusSchema>;

export const whitepaperSourceEntityTypeSchema = z.enum([
  "post",
  "note",
  "link",
  "deck",
  "project",
  "topic",
]);

export const whitepaperSourceEntitySchema = z.object({
  entityType: whitepaperSourceEntityTypeSchema,
  id: z.string(),
});

export const whitepaperDocumentReferenceSchema = z.object({
  id: z.string(),
});

export const whitepaperAppendixTypeSchema = z.enum([
  "glossary",
  "further-reading",
  "methodology",
  "references",
  "implementation-details",
  "other",
]);

export const whitepaperAppendixSchema = z.object({
  title: z.string(),
  type: whitepaperAppendixTypeSchema.optional(),
});

export const whitepaperFrontmatterSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  status: whitepaperStatusSchema,
  audience: z.array(z.string()).optional(),
  thesis: z.string().optional(),
  abstract: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  sourceEntities: z.array(whitepaperSourceEntitySchema).optional(),
  relatedPosts: z.array(z.string()).optional(),
  relatedNotes: z.array(z.string()).optional(),
  relatedLinks: z.array(z.string()).optional(),
  relatedProjects: z.array(z.string()).optional(),
  coverImageId: z.string().optional(),
  documents: z.array(whitepaperDocumentReferenceSchema).optional(),
  appendices: z.array(whitepaperAppendixSchema).optional(),
  slug: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
});

export type WhitepaperFrontmatter = z.infer<typeof whitepaperFrontmatterSchema>;

export const whitepaperMetadataSchema = whitepaperFrontmatterSchema
  .pick({
    title: true,
    status: true,
    slug: true,
    publishedAt: true,
  })
  .extend({
    slug: z.string(),
  });

export type WhitepaperMetadata = z.infer<typeof whitepaperMetadataSchema>;

export const whitepaperSchema = baseEntitySchema.extend({
  entityType: z.literal("whitepaper"),
  metadata: whitepaperMetadataSchema,
});

export type Whitepaper = z.infer<typeof whitepaperSchema>;

export const whitepaperWithDataSchema = whitepaperSchema.extend({
  frontmatter: whitepaperFrontmatterSchema,
  body: z.string(),
});

export type WhitepaperWithData = z.infer<typeof whitepaperWithDataSchema>;
