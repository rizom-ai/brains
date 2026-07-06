import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { summaryTimeRangeSchema, type SummaryTimeRange } from "./summary";

export interface MemoryActorReference {
  actorId: string;
  canonicalId?: string | undefined;
  displayName?: string | undefined;
}

export const memoryActorReferenceSchema: z.ZodType<MemoryActorReference> =
  z.object({
    actorId: z.string(),
    canonicalId: z.string().optional(),
    displayName: z.string().optional(),
  });

const memoryActorReferenceParserSchema: z.ZodType<MemoryActorReference> =
  z.object({
    actorId: z.string(),
    canonicalId: z.string().optional(),
    displayName: z.string().optional(),
  });

export interface ActionItemAssignee {
  actorId?: string | undefined;
  canonicalId?: string | undefined;
  displayName: string;
}

export const actionItemAssigneeSchema: z.ZodType<ActionItemAssignee> = z.object(
  {
    actorId: z.string().optional(),
    canonicalId: z.string().optional(),
    displayName: z.string().min(1),
  },
);

const actionItemAssigneeParserSchema: z.ZodType<ActionItemAssignee> = z.object({
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  displayName: z.string().min(1),
});

const memoryTimeRangeParserSchema: z.ZodType<SummaryTimeRange> = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type DecisionStatus = "active" | "superseded";

export interface DecisionMetadata {
  [key: string]: unknown;
  conversationId: string;
  channelId: string;
  channelName?: string | undefined;
  interfaceType: string;
  spaceId: string;
  timeRange: SummaryTimeRange;
  sourceSummaryId: string;
  sourceMessageCount: number;
  projectionVersion: number;
  status: DecisionStatus;
  decidedBy?: MemoryActorReference[] | undefined;
  mentionedBy?: MemoryActorReference[] | undefined;
}

type DecisionMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  spaceId: z.ZodString;
  timeRange: z.ZodType<SummaryTimeRange>;
  sourceSummaryId: z.ZodString;
  sourceMessageCount: z.ZodNumber;
  projectionVersion: z.ZodNumber;
  status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
  decidedBy: z.ZodOptional<z.ZodArray<z.ZodType<MemoryActorReference>>>;
  mentionedBy: z.ZodOptional<z.ZodArray<z.ZodType<MemoryActorReference>>>;
}>;

export const decisionMetadataSchema: DecisionMetadataSchema = z.object({
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

const decisionEntityMetadataParserSchema: z.ZodType<DecisionMetadata> =
  z.object({
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

export const decisionSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"decision">;
    metadata: z.ZodType<DecisionMetadata>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("decision"),
  metadata: decisionEntityMetadataParserSchema,
});

export type DecisionEntity = z.output<typeof decisionSchema>;

export type ActionItemStatus = "open" | "done" | "dropped";

export interface ActionItemMetadata {
  [key: string]: unknown;
  conversationId: string;
  channelId: string;
  channelName?: string | undefined;
  interfaceType: string;
  spaceId: string;
  timeRange: SummaryTimeRange;
  sourceSummaryId: string;
  sourceMessageCount: number;
  projectionVersion: number;
  status: ActionItemStatus;
  assignedTo?: ActionItemAssignee[] | undefined;
  requestedBy?: MemoryActorReference[] | undefined;
}

type ActionItemMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  spaceId: z.ZodString;
  timeRange: z.ZodType<SummaryTimeRange>;
  sourceSummaryId: z.ZodString;
  sourceMessageCount: z.ZodNumber;
  projectionVersion: z.ZodNumber;
  status: z.ZodEnum<{ open: "open"; done: "done"; dropped: "dropped" }>;
  assignedTo: z.ZodOptional<z.ZodArray<z.ZodType<ActionItemAssignee>>>;
  requestedBy: z.ZodOptional<z.ZodArray<z.ZodType<MemoryActorReference>>>;
}>;

export const actionItemMetadataSchema: ActionItemMetadataSchema = z.object({
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

const actionItemEntityMetadataParserSchema: z.ZodType<ActionItemMetadata> =
  z.object({
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

export const actionItemSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"action-item">;
    metadata: z.ZodType<ActionItemMetadata>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemEntityMetadataParserSchema,
});

export type ActionItemEntity = z.output<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
