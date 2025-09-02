import { z } from "@brains/utils";

/**
 * Individual log entry within a summary
 */
export const summaryLogEntrySchema = z.object({
  title: z.string().describe("Brief topic or phase description"),
  content: z.string().describe("The summary content for this entry"),
  created: z.string().datetime().describe("When this entry was created"),
  updated: z.string().datetime().describe("When this entry was last updated"),
  windowStart: z.number().describe("Start index of message window (1-based)"),
  windowEnd: z.number().describe("End index of message window (1-based)"),
  keyPoints: z.array(z.string()).optional().describe("Key points discussed"),
  decisions: z.array(z.string()).optional().describe("Decisions made"),
  actionItems: z
    .array(z.string())
    .optional()
    .describe("Action items identified"),
  participants: z.array(z.string()).optional().describe("Active participants"),
});

export type SummaryLogEntry = z.infer<typeof summaryLogEntrySchema>;

/**
 * Summary body schema - contains the log of summaries for a conversation
 */
export const summaryBodySchema = z.object({
  conversationId: z.string().describe("The conversation being summarized"),
  entries: z.array(summaryLogEntrySchema).describe("Chronological log entries"),
  totalMessages: z.number().describe("Total messages processed so far"),
  lastUpdated: z
    .string()
    .datetime()
    .describe("When the summary was last updated"),
});

export type SummaryBody = z.infer<typeof summaryBodySchema>;

/**
 * Summary entity schema - one per conversation
 */
export const summarySchema = z.object({
  id: z.string(), // Format: summary-{conversationId}
  entityType: z.literal("summary"),
  content: z.string(), // Structured markdown with log entries
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: z
    .object({
      conversationId: z.string(),
      entryCount: z.number(),
      totalMessages: z.number(),
      lastUpdated: z.string().datetime(),
    })
    .optional(),
  embedding: z.array(z.number()).optional(),
  source: z.string().optional(),
});

export type SummaryEntity = z.infer<typeof summarySchema>;

/**
 * Configuration schema for summary plugin
 */
export const summaryConfigSchema = z.object({
  enableAutoSummary: z
    .boolean()
    .default(true)
    .describe("Automatically create summaries from conversation digests"),
  includeDecisions: z
    .boolean()
    .default(true)
    .describe("Extract decisions from conversations"),
  includeActionItems: z
    .boolean()
    .default(true)
    .describe("Extract action items from conversations"),
  maxSummaryLength: z
    .number()
    .default(500)
    .describe("Maximum length of summary in characters"),
});

export type SummaryConfig = z.infer<typeof summaryConfigSchema>;

/**
 * AI decision result schema for digest analysis
 */
export const aiDecisionResultSchema = z.object({
  decision: z.enum(["update", "new"]),
  entryIndex: z.number().optional(),
  title: z.string(),
  reasoning: z.string(),
});

export type AiDecisionResult = z.infer<typeof aiDecisionResultSchema>;

/**
 * AI summary generation result schema
 */
export const aiSummaryResultSchema = z.object({
  content: z.string(),
  keyPoints: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
});

export type AiSummaryResult = z.infer<typeof aiSummaryResultSchema>;
