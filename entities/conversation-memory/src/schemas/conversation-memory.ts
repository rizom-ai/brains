import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { summaryTimeRangeSchema } from "./summary";

export const decisionMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: summaryTimeRangeSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["active", "superseded"]),
});

export type DecisionMetadata = z.infer<typeof decisionMetadataSchema>;

export const decisionSchema = baseEntitySchema.extend({
  entityType: z.literal("decision"),
  metadata: decisionMetadataSchema,
});

export type DecisionEntity = z.infer<typeof decisionSchema>;

export const actionItemMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: summaryTimeRangeSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["open", "done", "dropped"]),
});

export type ActionItemMetadata = z.infer<typeof actionItemMetadataSchema>;

export const actionItemSchema = baseEntitySchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemMetadataSchema,
});

export type ActionItemEntity = z.infer<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
