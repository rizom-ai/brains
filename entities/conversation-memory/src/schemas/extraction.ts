import { z } from "@brains/utils/zod-v4";

export interface ExtractedSummaryEntry {
  title: string;
  summary: string;
  startMessageIndex: number;
  endMessageIndex: number;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
}

export const extractedSummaryEntrySchema: z.ZodType<ExtractedSummaryEntry> =
  z.object({
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

export interface SummaryExtractionResult {
  entries: ExtractedSummaryEntry[];
}

export const summaryExtractionResultSchema: z.ZodType<SummaryExtractionResult> =
  z.object({
    entries: z.array(extractedSummaryEntrySchema),
  });

export interface SummaryProjectionDecision {
  decision: "skip" | "update" | "append";
  rationale: string;
}

export const summaryProjectionDecisionSchema: z.ZodType<SummaryProjectionDecision> =
  z.object({
    decision: z.enum(["skip", "update", "append"]),
    rationale: z.string(),
  });
