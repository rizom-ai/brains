import { summaryTimeRangeSchema } from "./summary";
import {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
} from "@brains/contracts";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export const memoryActorReferenceSchema: z.ZodObject<{
  identity: typeof actorRefSchema;
  identityAliases: z.ZodOptional<z.ZodArray<typeof actorRefSchema>>;
  displayName: z.ZodOptional<z.ZodString>;
}> = z.object({
  identity: actorRefSchema,
  identityAliases: z.array(actorRefSchema).optional(),
  displayName: z.string().optional(),
});

export type MemoryActorReference = z.output<typeof memoryActorReferenceSchema>;

const memoryActorReferenceParserSchema: z.ZodPreprocess<
  typeof memoryActorReferenceSchema
> = z.preprocess(
  (value) => normalizeLegacyMemoryActorReference(value, true),
  memoryActorReferenceSchema,
);

export const actionItemAssigneeSchema: z.ZodObject<{
  identity: z.ZodOptional<typeof actorRefSchema>;
  identityAliases: z.ZodOptional<z.ZodArray<typeof actorRefSchema>>;
  displayName: z.ZodString;
}> = z.object({
  identity: actorRefSchema.optional(),
  identityAliases: z.array(actorRefSchema).optional(),
  displayName: z.string().min(1),
});

export type ActionItemAssignee = z.output<typeof actionItemAssigneeSchema>;

const actionItemAssigneeParserSchema: z.ZodPreprocess<
  typeof actionItemAssigneeSchema
> = z.preprocess(
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

type DecisionMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  spaceId: z.ZodString;
  timeRange: typeof summaryTimeRangeSchema;
  sourceSummaryId: z.ZodString;
  sourceMessageCount: z.ZodNumber;
  projectionVersion: z.ZodNumber;
  status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
  decidedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
  mentionedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
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

const decisionEntityMetadataParserSchema: z.ZodObject<
  Omit<DecisionMetadataSchema["shape"], "decidedBy" | "mentionedBy"> & {
    decidedBy: z.ZodOptional<
      z.ZodArray<typeof memoryActorReferenceParserSchema>
    >;
    mentionedBy: z.ZodOptional<
      z.ZodArray<typeof memoryActorReferenceParserSchema>
    >;
  }
> = z.object({
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
  decidedBy: z.array(memoryActorReferenceParserSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceParserSchema).optional(),
});

/** Decision entity metadata, as parsed from stored (possibly legacy) records. */
export type DecisionMetadata = z.output<
  typeof decisionEntityMetadataParserSchema
>;
export type DecisionStatus = DecisionMetadata["status"];

export const decisionSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"decision">;
    metadata: typeof decisionEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("decision"),
  metadata: decisionEntityMetadataParserSchema,
});

export type DecisionEntity = z.output<typeof decisionSchema>;

type ActionItemStatusSchema = z.ZodEnum<{
  open: "open";
  doing: "doing";
  blocked: "blocked";
  done: "done";
  dropped: "dropped";
}>;

/** To do, doing, blocked and done are board columns; dropped leaves the board. */
export const actionItemStatusSchema: ActionItemStatusSchema = z.enum([
  "open",
  "doing",
  "blocked",
  "done",
  "dropped",
]);

type ActionItemHistoryEntrySchema = z.ZodObject<{
  at: z.ZodISODateTime;
  actor: typeof actorRefSchema;
  displayName: z.ZodOptional<z.ZodString>;
  from: ActionItemStatusSchema;
  to: ActionItemStatusSchema;
}>;

/** One status change and who made it. */
export const actionItemHistoryEntrySchema: ActionItemHistoryEntrySchema =
  z.object({
    at: z.iso.datetime(),
    actor: actorRefSchema,
    /** The mover's name when they moved it; the actor stays authoritative. */
    displayName: z.string().optional(),
    from: actionItemStatusSchema,
    to: actionItemStatusSchema,
  });

export type ActionItemHistoryEntry = z.output<
  typeof actionItemHistoryEntrySchema
>;

type ActionItemSourceRefSchema = z.ZodObject<{
  sourceId: z.ZodString;
  entityType: z.ZodString;
  entityId: z.ZodString;
}>;

/** The Inbox item a tracked action item came from. */
export const actionItemSourceRefSchema: ActionItemSourceRefSchema = z.object({
  sourceId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

type ActionItemMetadataSchema = z.ZodObject<{
  /** Absent on items projected before origins were recorded: a conversation. */
  origin: z.ZodOptional<
    z.ZodEnum<{ conversation: "conversation"; inbox: "inbox" }>
  >;
  conversationId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodOptional<z.ZodString>;
  spaceId: z.ZodOptional<z.ZodString>;
  timeRange: z.ZodOptional<typeof summaryTimeRangeSchema>;
  sourceSummaryId: z.ZodOptional<z.ZodString>;
  sourceMessageCount: z.ZodOptional<z.ZodNumber>;
  projectionVersion: z.ZodOptional<z.ZodNumber>;
  sourceRef: z.ZodOptional<ActionItemSourceRefSchema>;
  capturedAt: z.ZodOptional<z.ZodISODateTime>;
  status: ActionItemStatusSchema;
  assignedTo: z.ZodOptional<z.ZodArray<typeof actionItemAssigneeSchema>>;
  requestedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
  projectedBodyHash: z.ZodOptional<z.ZodString>;
  history: z.ZodOptional<z.ZodArray<ActionItemHistoryEntrySchema>>;
}>;

const CONVERSATION_FIELDS = [
  "conversationId",
  "channelId",
  "interfaceType",
  "spaceId",
  "timeRange",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
] as const;

/** A conversation item carries its conversation; an Inbox item, its source. */
function requireOriginFields(
  metadata: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if (metadata["origin"] === "inbox") {
    for (const field of ["sourceRef", "capturedAt"] as const) {
      if (metadata[field] === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `An action item tracked from the Inbox needs ${field}`,
        });
      }
    }
    return;
  }
  for (const field of CONVERSATION_FIELDS) {
    if (metadata[field] === undefined) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `An action item from a conversation needs ${field}`,
      });
    }
  }
}

const originShape = {
  origin: z.enum(["conversation", "inbox"]).optional(),
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string().optional(),
  spaceId: z.string().optional(),
  timeRange: summaryTimeRangeSchema.optional(),
  sourceSummaryId: z.string().optional(),
  sourceMessageCount: z.number().int().min(0).optional(),
  projectionVersion: z.number().int().min(1).optional(),
  sourceRef: actionItemSourceRefSchema.optional(),
  capturedAt: z.iso.datetime().optional(),
};

export const actionItemMetadataSchema: ActionItemMetadataSchema = z
  .object({
    ...originShape,
    status: actionItemStatusSchema,
    assignedTo: z.array(actionItemAssigneeSchema).optional(),
    requestedBy: z.array(memoryActorReferenceSchema).optional(),
    /** Body hash when the projector wrote the item; a different body is the board's. */
    projectedBodyHash: z.string().optional(),
    history: z.array(actionItemHistoryEntrySchema).optional(),
  })
  .superRefine(requireOriginFields);

const actionItemEntityMetadataParserSchema: z.ZodObject<
  Omit<ActionItemMetadataSchema["shape"], "assignedTo" | "requestedBy"> & {
    assignedTo: z.ZodOptional<
      z.ZodArray<typeof actionItemAssigneeParserSchema>
    >;
    requestedBy: z.ZodOptional<
      z.ZodArray<typeof memoryActorReferenceParserSchema>
    >;
  }
> = z
  .object({
    ...originShape,
    status: actionItemStatusSchema,
    assignedTo: z.array(actionItemAssigneeParserSchema).optional(),
    requestedBy: z.array(memoryActorReferenceParserSchema).optional(),
    projectedBodyHash: z.string().optional(),
    history: z.array(actionItemHistoryEntrySchema).optional(),
  })
  .superRefine(requireOriginFields);

/** Action item entity metadata, as parsed from stored (possibly legacy) records. */
export type ActionItemMetadata = z.output<
  typeof actionItemEntityMetadataParserSchema
>;
export type ActionItemStatus = ActionItemMetadata["status"];
export type ActionItemSourceRef = z.output<typeof actionItemSourceRefSchema>;

export type ActionItemOrigin =
  | {
      kind: "conversation";
      conversationId: string;
      channelId: string;
      channelName?: string;
      interfaceType: string;
      spaceId: string;
      sourceSummaryId: string;
      /** When the conversation it came from ended. */
      capturedAt: string;
    }
  | { kind: "inbox"; sourceRef: ActionItemSourceRef; capturedAt: string };

/** Where an action item came from; the schema guarantees one complete answer. */
export function actionItemOrigin(
  metadata: Pick<
    ActionItemMetadata,
    | "origin"
    | "conversationId"
    | "channelId"
    | "channelName"
    | "interfaceType"
    | "spaceId"
    | "timeRange"
    | "sourceSummaryId"
    | "sourceRef"
    | "capturedAt"
  >,
): ActionItemOrigin {
  if (
    metadata.origin === "inbox" &&
    metadata.sourceRef &&
    metadata.capturedAt
  ) {
    return {
      kind: "inbox",
      sourceRef: metadata.sourceRef,
      capturedAt: metadata.capturedAt,
    };
  }
  if (
    metadata.conversationId !== undefined &&
    metadata.channelId !== undefined &&
    metadata.interfaceType !== undefined &&
    metadata.spaceId !== undefined &&
    metadata.sourceSummaryId !== undefined &&
    metadata.timeRange !== undefined
  ) {
    return {
      kind: "conversation",
      conversationId: metadata.conversationId,
      channelId: metadata.channelId,
      ...(metadata.channelName ? { channelName: metadata.channelName } : {}),
      interfaceType: metadata.interfaceType,
      spaceId: metadata.spaceId,
      sourceSummaryId: metadata.sourceSummaryId,
      capturedAt: metadata.timeRange.end,
    };
  }
  throw new Error("Action item metadata names no complete origin");
}

export const actionItemSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"action-item">;
    metadata: typeof actionItemEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemEntityMetadataParserSchema,
});

export type ActionItemEntity = z.output<typeof actionItemSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
