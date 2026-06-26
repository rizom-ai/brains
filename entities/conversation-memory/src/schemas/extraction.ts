import { z } from "@brains/utils/zod-v4";

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

export type ExtractedSummaryEntry = z.output<
  typeof extractedSummaryEntrySchema
>;

export const summaryExtractionResultSchema = z.object({
  entries: z.array(extractedSummaryEntrySchema),
});

export type SummaryExtractionResult = z.output<
  typeof summaryExtractionResultSchema
>;

export const summaryProjectionDecisionSchema = z.object({
  decision: z.enum(["skip", "update", "append"]),
  rationale: z.string(),
});

export type SummaryProjectionDecision = z.output<
  typeof summaryProjectionDecisionSchema
>;
