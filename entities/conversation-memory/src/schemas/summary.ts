import { z } from "./main-zod";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

export const summaryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type SummaryTimeRange = z.output<typeof summaryTimeRangeSchema>;

const summaryTimeRangeParserSchema = z4.object({
  start: z4.string().datetime(),
  end: z4.string().datetime(),
});

export const summaryEntrySchema = z4.object({
  title: z4.string().min(1).describe("Brief topic or phase title"),
  summary: z4.string().min(1).describe("Grounded prose summary"),
  timeRange: summaryTimeRangeParserSchema,
  sourceMessageCount: z4.number().int().min(0),
  keyPoints: z4.array(z4.string()),
});

export type SummaryEntry = z4.output<typeof summaryEntrySchema>;

export const summaryBodySchema = z4.object({
  entries: z4.array(summaryEntrySchema),
});

export type SummaryBody = z4.output<typeof summaryBodySchema>;

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

const summaryParticipantParserSchema = z4.object({
  actorId: z4.string(),
  canonicalId: z4.string().optional(),
  displayName: z4.string().optional(),
  roles: z4.array(z4.enum(["user", "assistant", "system"])).min(1),
  sourceActorIds: z4.array(z4.string()).optional(),
});

const summaryEntityMetadataParserSchema = z4.object({
  conversationId: z4.string(),
  channelId: z4.string(),
  channelName: z4.string().optional(),
  interfaceType: z4.string(),
  timeRange: summaryTimeRangeParserSchema.optional(),
  messageCount: z4.number().int().min(0),
  entryCount: z4.number().int().min(0),
  participants: z4.array(summaryParticipantParserSchema).optional(),
  sourceHash: z4.string(),
  projectionVersion: z4.number().int().min(1),
});

export const summarySchema = baseEntityParserSchema.extend({
  entityType: z4.literal("summary"),
  metadata: summaryEntityMetadataParserSchema,
});

export type SummaryEntity = z4.output<typeof summarySchema>;
