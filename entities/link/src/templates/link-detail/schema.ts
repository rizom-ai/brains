import { z } from "@brains/utils/zod-v4";

const linkSourceSchema = z.object({
  ref: z.string(),
  label: z.string(),
});

const linkFrontmatterSchema = z.object({
  status: z.enum(["pending", "draft", "published"]),
  title: z.string(),
  url: z.url(),
  description: z.string().optional(),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
});

// Schema for link detail - frontmatter fields plus id and summary
const linkDetailSchema = linkFrontmatterSchema.extend({
  id: z.string(),
  summary: z.string().optional(),
});

// Schema for link detail page data
export const linkDetailDataSchema = z.object({
  link: linkDetailSchema,
  prevLink: linkDetailSchema.nullable(),
  nextLink: linkDetailSchema.nullable(),
});

export type LinkDetail = z.output<typeof linkDetailSchema>;
export type LinkDetailData = z.output<typeof linkDetailDataSchema>;
