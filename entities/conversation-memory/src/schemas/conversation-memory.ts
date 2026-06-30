import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { summaryTimeRangeSchema } from "./summary";

export const memoryActorReferenceSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
});

export type MemoryActorReference = z.output<typeof memoryActorReferenceSchema>;

const memoryActorReferenceParserSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
});

export const actionItemAssigneeSchema = z.object({
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  displayName: z.string().min(1),
});

export type ActionItemAssignee = z.output<typeof actionItemAssigneeSchema>;

const actionItemAssigneeParserSchema = z.object({
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  displayName: z.string().min(1),
});

const memoryTimeRangeParserSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
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

const decisionEntityMetadataParserSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: memoryTimeRangeParserSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["active", "superseded"]),
  decidedBy: z.array(memoryActorReferenceParserSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceParserSchema).optional(),
});

export const decisionSchema = baseEntityParserSchema.extend({
  entityType: z.literal("decision"),
  metadata: decisionEntityMetadataParserSchema,
});

export type DecisionEntity = z.output<typeof decisionSchema>;

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

const actionItemEntityMetadataParserSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: memoryTimeRangeParserSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["open", "done", "dropped"]),
  assignedTo: z.array(actionItemAssigneeParserSchema).optional(),
  requestedBy: z.array(memoryActorReferenceParserSchema).optional(),
});

export const actionItemSchema = baseEntityParserSchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemEntityMetadataParserSchema,
});

export type ActionItemEntity = z.output<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
