import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { summaryTimeRangeSchema } from "./summary";

export const memoryActorReferenceSchema = z.object({
  actorId: z.string(),
  displayName: z.string().optional(),
});

export type MemoryActorReference = z.infer<typeof memoryActorReferenceSchema>;

export const actionItemAssigneeSchema = z.object({
  actorId: z.string().optional(),
  displayName: z.string().min(1),
});

export type ActionItemAssignee = z.infer<typeof actionItemAssigneeSchema>;

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
  assignedTo: z.array(actionItemAssigneeSchema).optional(),
  requestedBy: z.array(memoryActorReferenceSchema).optional(),
});

export type ActionItemMetadata = z.infer<typeof actionItemMetadataSchema>;

export const actionItemSchema = baseEntitySchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemMetadataSchema,
});

export type ActionItemEntity = z.infer<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
