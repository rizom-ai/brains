import { z } from "@brains/utils";
import { linkBodySchema } from "../../schemas/link";

// Schema for link summary - extends linkBody with id and title
const linkSummarySchema = linkBodySchema.extend({
  id: z.string(),
  title: z.string(),
});

// Schema for link list page data
export const linkListSchema = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});

export type LinkSummary = z.infer<typeof linkSummarySchema>;
export type LinkListData = z.infer<typeof linkListSchema>;
