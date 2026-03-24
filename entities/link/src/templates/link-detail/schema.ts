import { z } from "@brains/utils";
import { linkFrontmatterSchema } from "../../schemas/link";

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

export type LinkDetail = z.infer<typeof linkDetailSchema>;
export type LinkDetailData = z.infer<typeof linkDetailDataSchema>;
