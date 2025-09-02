import { z } from "@brains/utils";
import { linkBodySchema } from "../../schemas/link";

// Schema for link summary - extends linkBody with id, title, and conversationId
const linkSummarySchema = linkBodySchema.extend({
  id: z.string(),
  title: z.string(),
  conversationId: z.string().optional(),
});

// Schema for link list page data
export const linkListSchema = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});

export type LinkSummary = z.infer<typeof linkSummarySchema>;
export type LinkListData = z.infer<typeof linkListSchema>;
