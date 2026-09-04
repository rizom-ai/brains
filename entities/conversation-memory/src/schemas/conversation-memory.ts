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

type ActionItemMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  spaceId: z.ZodString;
  timeRange: typeof summaryTimeRangeSchema;
  sourceSummaryId: z.ZodString;
  sourceMessageCount: z.ZodNumber;
  projectionVersion: z.ZodNumber;
  status: z.ZodEnum<{ open: "open"; done: "done"; dropped: "dropped" }>;
  assignedTo: z.ZodOptional<z.ZodArray<typeof actionItemAssigneeSchema>>;
  requestedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
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

const actionItemEntityMetadataParserSchema: z.ZodObject<
  Omit<ActionItemMetadataSchema["shape"], "assignedTo" | "requestedBy"> & {
    assignedTo: z.ZodOptional<
      z.ZodArray<typeof actionItemAssigneeParserSchema>
    >;
    requestedBy: z.ZodOptional<
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
  status: z.enum(["open", "done", "dropped"]),
  assignedTo: z.array(actionItemAssigneeParserSchema).optional(),
  requestedBy: z.array(memoryActorReferenceParserSchema).optional(),
});

/** Action item entity metadata, as parsed from stored (possibly legacy) records. */
export type ActionItemMetadata = z.output<
  typeof actionItemEntityMetadataParserSchema
>;
export type ActionItemStatus = ActionItemMetadata["status"];

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
