import { z } from "@brains/utils";

export const extractedSummaryEntrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  startMessageIndex: z
    .number()
    .int()
    .min(1)
    .describe("1-based index of the first source message in the prompt"),
  endMessageIndex: z
    .number()
    .int()
    .min(1)
    .describe("1-based index of the last source message in the prompt"),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(z.string()),
});

export type ExtractedSummaryEntry = z.infer<typeof extractedSummaryEntrySchema>;

export const summaryExtractionResultSchema = z.object({
  entries: z.array(extractedSummaryEntrySchema),
});

export type SummaryExtractionResult = z.infer<
  typeof summaryExtractionResultSchema
>;
