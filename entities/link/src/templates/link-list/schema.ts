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

// Schema for link summary - frontmatter fields plus id
const linkSummarySchema = linkFrontmatterSchema.extend({
  id: z.string(),
  summary: z.string().optional(),
});

// Schema for link list page data
export const linkListSchema = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});

export type LinkSummary = z.output<typeof linkSummarySchema>;
export type LinkListData = z.output<typeof linkListSchema>;
