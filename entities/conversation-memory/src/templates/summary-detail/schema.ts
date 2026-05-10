import { z } from "@brains/utils";
import { summaryEntrySchema } from "../../schemas/summary";

export const summaryDetailSchema = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryEntrySchema),
  messageCount: z.number(),
  entryCount: z.number(),
  updated: z.string(),
});

export type SummaryDetailData = z.infer<typeof summaryDetailSchema>;
