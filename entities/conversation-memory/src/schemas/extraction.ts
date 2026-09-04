import { z } from "@brains/utils/zod";

export const extractedSummaryEntrySchema: z.ZodObject<{
  title: z.ZodString;
  summary: z.ZodString;
  startMessageIndex: z.ZodNumber;
  endMessageIndex: z.ZodNumber;
  keyPoints: z.ZodArray<z.ZodString>;
  decisions: z.ZodArray<z.ZodString>;
  actionItems: z.ZodArray<z.ZodString>;
}> = z.object({
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

export const summaryExtractionResultSchema: z.ZodObject<{
  entries: z.ZodArray<typeof extractedSummaryEntrySchema>;
}> = z.object({
  entries: z.array(extractedSummaryEntrySchema),
});

export type SummaryExtractionResult = z.output<
  typeof summaryExtractionResultSchema
>;

export const summaryProjectionDecisionSchema: z.ZodObject<{
  decision: z.ZodEnum<{ skip: "skip"; update: "update"; append: "append" }>;
  rationale: z.ZodString;
}> = z.object({
  decision: z.enum(["skip", "update", "append"]),
  rationale: z.string(),
});

export type SummaryProjectionDecision = z.output<
  typeof summaryProjectionDecisionSchema
>;
