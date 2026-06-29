import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "./main-zod";
import { z as z4 } from "@brains/utils/zod-v4";
import { summaryTimeRangeSchema } from "./summary";

export const memoryActorReferenceSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
});

export type MemoryActorReference = z.output<typeof memoryActorReferenceSchema>;

const memoryActorReferenceParserSchema = z4.object({
  actorId: z4.string(),
  canonicalId: z4.string().optional(),
  displayName: z4.string().optional(),
});

export const actionItemAssigneeSchema = z.object({
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  displayName: z.string().min(1),
});

export type ActionItemAssignee = z.output<typeof actionItemAssigneeSchema>;

const actionItemAssigneeParserSchema = z4.object({
  actorId: z4.string().optional(),
  canonicalId: z4.string().optional(),
  displayName: z4.string().min(1),
});

const memoryTimeRangeParserSchema = z4.object({
  start: z4.string().datetime(),
  end: z4.string().datetime(),
});

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
  decidedBy: z.array(memoryActorReferenceSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceSchema).optional(),
});

export type DecisionMetadata = z.output<typeof decisionMetadataSchema>;

const decisionEntityMetadataParserSchema = z4.object({
  conversationId: z4.string(),
  channelId: z4.string(),
  channelName: z4.string().optional(),
  interfaceType: z4.string(),
  spaceId: z4.string(),
  timeRange: memoryTimeRangeParserSchema,
  sourceSummaryId: z4.string(),
  sourceMessageCount: z4.number().int().min(0),
  projectionVersion: z4.number().int().min(1),
  status: z4.enum(["active", "superseded"]),
  decidedBy: z4.array(memoryActorReferenceParserSchema).optional(),
  mentionedBy: z4.array(memoryActorReferenceParserSchema).optional(),
});

export const decisionSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("decision"),
  metadata: decisionEntityMetadataParserSchema,
});

export type DecisionEntity = z4.output<typeof decisionSchema>;

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
  assignedTo: z.array(actionItemAssigneeSchema).optional(),
  requestedBy: z.array(memoryActorReferenceSchema).optional(),
});

export type ActionItemMetadata = z.output<typeof actionItemMetadataSchema>;

const actionItemEntityMetadataParserSchema = z4.object({
  conversationId: z4.string(),
  channelId: z4.string(),
  channelName: z4.string().optional(),
  interfaceType: z4.string(),
  spaceId: z4.string(),
  timeRange: memoryTimeRangeParserSchema,
  sourceSummaryId: z4.string(),
  sourceMessageCount: z4.number().int().min(0),
  projectionVersion: z4.number().int().min(1),
  status: z4.enum(["open", "done", "dropped"]),
  assignedTo: z4.array(actionItemAssigneeParserSchema).optional(),
  requestedBy: z4.array(memoryActorReferenceParserSchema).optional(),
});

export const actionItemSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("action-item"),
  metadata: actionItemEntityMetadataParserSchema,
});

export type ActionItemEntity = z4.output<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
