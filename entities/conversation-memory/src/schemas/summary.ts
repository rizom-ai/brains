import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

export const summaryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type SummaryTimeRange = z.output<typeof summaryTimeRangeSchema>;

const summaryTimeRangeParserSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const summaryEntrySchema = z.object({
  title: z.string().min(1).describe("Brief topic or phase title"),
  summary: z.string().min(1).describe("Grounded prose summary"),
  timeRange: summaryTimeRangeParserSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
});

export type SummaryEntry = z.output<typeof summaryEntrySchema>;

export const summaryBodySchema = z.object({
  entries: z.array(summaryEntrySchema),
});

export type SummaryBody = z.output<typeof summaryBodySchema>;

export const summaryParticipantSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
  roles: z.array(z.enum(["user", "assistant", "system"])).min(1),
  sourceActorIds: z.array(z.string()).optional(),
});

export type SummaryParticipant = z.output<typeof summaryParticipantSchema>;

export const summaryMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

export type SummaryMetadata = z.output<typeof summaryMetadataSchema>;

const summaryParticipantParserSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
  roles: z.array(z.enum(["user", "assistant", "system"])).min(1),
  sourceActorIds: z.array(z.string()).optional(),
});

const summaryEntityMetadataParserSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeParserSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantParserSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

export const summarySchema = baseEntityParserSchema.extend({
  entityType: z.literal("summary"),
  metadata: summaryEntityMetadataParserSchema,
});

export type SummaryEntity = z.output<typeof summarySchema>;
