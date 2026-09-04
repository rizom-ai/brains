import { z } from "@brains/utils/zod";
import { summaryEntrySchema } from "../../schemas/summary";

export const summaryDetailSchema: z.ZodObject<{
  conversationId: z.ZodString;
  channelName: z.ZodString;
  entries: z.ZodArray<typeof summaryEntrySchema>;
  messageCount: z.ZodNumber;
  entryCount: z.ZodNumber;
  updated: z.ZodString;
}> = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryEntrySchema),
  messageCount: z.number(),
  entryCount: z.number(),
  updated: z.string(),
});

export type SummaryDetailData = z.output<typeof summaryDetailSchema>;
