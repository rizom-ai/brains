import { z } from "@brains/utils";
import { linkFrontmatterSchema } from "../../schemas/link";

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

export type LinkSummary = z.infer<typeof linkSummarySchema>;
export type LinkListData = z.infer<typeof linkListSchema>;
