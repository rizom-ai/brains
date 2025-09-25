import { z } from "@brains/utils";

/**
 * Individual log entry within a summary
 * Simplified to essential fields - details are in natural prose
 */
export const summaryLogEntrySchema = z.object({
  title: z.string().describe("Brief topic or phase description"),
  content: z
    .string()
    .describe("Natural summary prose including all relevant details"),
  created: z.string().datetime().describe("When this entry was created"),
  updated: z.string().datetime().describe("When this entry was last updated"),
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
  metadata: z.object({
    conversationId: z.string(),
    channelName: z.string(),
    entryCount: z.number(),
    totalMessages: z.number(),
    lastUpdated: z.string().datetime(),
  }),
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
