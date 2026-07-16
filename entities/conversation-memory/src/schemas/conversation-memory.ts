import { type SummaryTimeRange, summaryTimeRangeSchema } from "./summary";
import {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
  type ActorRef,
} from "@brains/contracts";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface MemoryActorReference {
  identity: ActorRef;
  identityAliases?: ActorRef[] | undefined;
  displayName?: string | undefined;
}

export const memoryActorReferenceSchema: z.ZodType<MemoryActorReference> =
  z.object({
    identity: actorRefSchema,
    identityAliases: z.array(actorRefSchema).optional(),
    displayName: z.string().optional(),
  });

const memoryActorReferenceParserSchema: z.ZodType<
  MemoryActorReference,
  unknown
> = z.preprocess(
  (value) => normalizeLegacyMemoryActorReference(value, true),
  memoryActorReferenceSchema,
);

export interface ActionItemAssignee {
  identity?: ActorRef | undefined;
  identityAliases?: ActorRef[] | undefined;
  displayName: string;
}

export const actionItemAssigneeSchema: z.ZodType<ActionItemAssignee> = z.object(
  {
    identity: actorRefSchema.optional(),
    identityAliases: z.array(actorRefSchema).optional(),
    displayName: z.string().min(1),
  },
);

const actionItemAssigneeParserSchema: z.ZodType<ActionItemAssignee, unknown> =
  z.preprocess(
    (value) => normalizeLegacyMemoryActorReference(value, false),
    actionItemAssigneeSchema,
  );

function normalizeLegacyMemoryActorReference(
  value: unknown,
  identityRequired: boolean,
): unknown {
  if (!isRecord(value) || "identity" in value) return value;
  const actorId = value["actorId"];
  if (typeof actorId !== "string") {
    return identityRequired ? value : { displayName: value["displayName"] };
  }
  const separator = actorId.indexOf(":");
  const canonicalId = value["canonicalId"];
  const role = actorId.startsWith("brain:") ? "assistant" : "user";
  const sourceActorIds = Array.isArray(value["sourceActorIds"])
    ? value["sourceActorIds"].filter(
        (candidate): candidate is string => typeof candidate === "string",
      )
    : [];
  const identityAliases = Array.from(
    new Map(
      [actorId, ...sourceActorIds].map((legacyActorId) => {
        const sourceSeparator = legacyActorId.indexOf(":");
        const alias = actorRefFromLegacy({
          actorId: legacyActorId,
          interfaceType:
            sourceSeparator > 0
              ? legacyActorId.slice(0, sourceSeparator)
              : "legacy",
          role,
        });
        return [actorRefKey(alias), alias];
      }),
    ).values(),
  );
  return {
    identity: actorRefFromLegacy({
      actorId,
      interfaceType: separator > 0 ? actorId.slice(0, separator) : "legacy",
      role,
      ...(typeof canonicalId === "string" ? { canonicalId } : {}),
    }),
    ...(identityAliases.length > 0 ? { identityAliases } : {}),
    ...(typeof value["displayName"] === "string"
      ? { displayName: value["displayName"] }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
