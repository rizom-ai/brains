import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

export const summaryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type SummaryTimeRange = z.infer<typeof summaryTimeRangeSchema>;

export const summaryEntrySchema = z.object({
  title: z.string().min(1).describe("Brief topic or phase title"),
  summary: z.string().min(1).describe("Grounded prose summary"),
  timeRange: summaryTimeRangeSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(z.string()),
});

export type SummaryEntry = z.infer<typeof summaryEntrySchema>;

export const summaryBodySchema = z.object({
  entries: z.array(summaryEntrySchema),
});

export type SummaryBody = z.infer<typeof summaryBodySchema>;

export const summaryMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

export type SummaryMetadata = z.infer<typeof summaryMetadataSchema>;

export const summarySchema = baseEntitySchema.extend({
  entityType: z.literal("summary"),
  metadata: summaryMetadataSchema,
});

export type SummaryEntity = z.infer<typeof summarySchema>;

export const summaryConfigSchema = z.object({
  enableProjection: z
    .boolean()
    .default(true)
    .describe("Project summaries from stored conversation messages"),
  maxSourceMessages: z
    .number()
    .int()
    .min(1)
    .default(1000)
    .describe("Maximum recent messages to load for one projection"),
  maxMessagesPerChunk: z
    .number()
    .int()
    .min(1)
    .default(40)
    .describe("Maximum messages sent to one summary extraction call"),
  minMessagesBetweenProjections: z
    .number()
    .int()
    .min(1)
    .default(5)
    .describe("Minimum new messages before projecting an existing summary"),
  minMinutesBetweenProjections: z
    .number()
    .min(0)
    .default(5)
    .describe("Minimum elapsed minutes before projecting an existing summary"),
  maxEntries: z
    .number()
    .int()
    .min(1)
    .default(50)
    .describe("Maximum summary entries per conversation"),
  maxEntryLength: z
    .number()
    .int()
    .min(100)
    .default(800)
    .describe("Target maximum length of each generated summary entry"),
  includeKeyPoints: z.boolean().default(true),
  includeDecisions: z.boolean().default(true),
  includeActionItems: z.boolean().default(true),
  projectionVersion: z.number().int().min(1).default(1),
});

export type SummaryConfig = z.infer<typeof summaryConfigSchema>;

// Backward-compatible type aliases for package consumers during the refactor.
export type SummaryLogEntry = SummaryEntry;
