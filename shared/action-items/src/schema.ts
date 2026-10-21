import {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
} from "@brains/contracts";
import { baseEntityParserSchema } from "@brains/plugins";
import { fillCapturedAt, flattenStoredPerson } from "./stored-shape";
import { z } from "@brains/utils/zod";

type MemoryTimeRangeSchema = z.ZodObject<{
  start: z.ZodString;
  end: z.ZodString;
}>;

/** The span of a conversation that a memory was captured from. */
export const memoryTimeRangeSchema: MemoryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

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

/** Reads stored actor references, including legacy shapes. */
export const memoryActorReferenceParserSchema: z.ZodPreprocess<
  typeof memoryActorReferenceSchema
> = z.preprocess(
  (value) => normalizeLegacyMemoryActorReference(value, true),
  memoryActorReferenceSchema,
);

/** An actor's canonical id, as `actorRefKey` writes it: `user:usr_…`, `external:ext_…`. */
const actorIdSchema: z.ZodString = z
  .string()
  .regex(/^(user|external|agent|service):.+$/);

type ActionItemAssigneeSchema = z.ZodObject<{
  name: z.ZodString;
  id: z.ZodOptional<z.ZodString>;
  aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

/** Who a card is for: a name, and their actor id when the brain knows it. */
export const actionItemAssigneeSchema: ActionItemAssigneeSchema = z.object({
  name: z.string().min(1),
  id: actorIdSchema.optional(),
  /** Other ids the same person was seen under. */
  aliases: z.array(actorIdSchema).optional(),
});

type ActionItemRequesterSchema = z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  id: z.ZodString;
  aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

/** Who asked for a card: always a known actor, named when the name is known. */
export const actionItemRequesterSchema: ActionItemRequesterSchema = z.object({
  name: z.string().min(1).optional(),
  id: actorIdSchema,
  aliases: z.array(actorIdSchema).optional(),
});

export type ActionItemAssignee = z.output<typeof actionItemAssigneeSchema>;
export type ActionItemRequester = z.output<typeof actionItemRequesterSchema>;

const storedAssigneeSchema: z.ZodPreprocess<typeof actionItemAssigneeSchema> =
  z.preprocess(
    (value) =>
      flattenStoredPerson(value, (stored) =>
        normalizeLegacyMemoryActorReference(stored, false),
      ),
    actionItemAssigneeSchema,
  );

const storedRequesterSchema: z.ZodPreprocess<typeof actionItemRequesterSchema> =
  z.preprocess(
    (value) =>
      flattenStoredPerson(value, (stored) =>
        normalizeLegacyMemoryActorReference(stored, true),
      ),
    actionItemRequesterSchema,
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
    z.ZodEnum<{
      conversation: "conversation";
      inbox: "inbox";
      board: "board";
    }>
  >;
  conversationId: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  sourceRef: z.ZodOptional<ActionItemSourceRefSchema>;
  capturedAt: z.ZodISODateTime;
  status: ActionItemStatusSchema;
  assignedTo: z.ZodOptional<z.ZodArray<typeof actionItemAssigneeSchema>>;
  requestedBy: z.ZodOptional<z.ZodArray<typeof actionItemRequesterSchema>>;
  projectedBodyHash: z.ZodOptional<z.ZodString>;
}>;

const CONVERSATION_FIELDS = [
  "conversationId",
  "interfaceType",
  "channelId",
] as const;

/**
 * A conversation item carries its conversation; an Inbox item, its source. A
 * card added on the board needs neither.
 */
function requireOriginFields(
  metadata: Record<string, unknown>,
  context: z.RefinementCtx,
): void {
  if (metadata["origin"] === "board") return;
  const required =
    metadata["origin"] === "inbox"
      ? (["sourceRef"] as const)
      : CONVERSATION_FIELDS;
  for (const field of required) {
    if (metadata[field] === undefined) {
      context.addIssue({
        code: "custom",
        path: [field],
        message:
          metadata["origin"] === "inbox"
            ? `An action item tracked from the Inbox needs ${field}`
            : `An action item from a conversation needs ${field}`,
      });
    }
  }
}

const originShape = {
  origin: z.enum(["conversation", "inbox", "board"]).optional(),
  conversationId: z.string().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  sourceRef: actionItemSourceRefSchema.optional(),
  capturedAt: z.iso.datetime(),
};

export const actionItemMetadataSchema: ActionItemMetadataSchema = z
  .object({
    ...originShape,
    status: actionItemStatusSchema,
    assignedTo: z.array(actionItemAssigneeSchema).optional(),
    requestedBy: z.array(actionItemRequesterSchema).optional(),
    /** Body hash when the projector wrote the item; a different body is the board's. */
    projectedBodyHash: z.string().optional(),
  })
  .superRefine(requireOriginFields);

/** Action item metadata as stored, including items written before the trim. */
export const actionItemStoredMetadataSchema: z.ZodPreprocess<
  z.ZodObject<
    Omit<ActionItemMetadataSchema["shape"], "assignedTo" | "requestedBy"> & {
      assignedTo: z.ZodOptional<z.ZodArray<typeof storedAssigneeSchema>>;
      requestedBy: z.ZodOptional<z.ZodArray<typeof storedRequesterSchema>>;
    }
  >
> = z.preprocess(
  fillCapturedAt,
  z
    .object({
      ...originShape,
      status: actionItemStatusSchema,
      assignedTo: z.array(storedAssigneeSchema).optional(),
      requestedBy: z.array(storedRequesterSchema).optional(),
      projectedBodyHash: z.string().optional(),
    })
    .superRefine(requireOriginFields),
);

/** Action item entity metadata, as parsed from stored records. */
export type ActionItemMetadata = z.output<
  typeof actionItemStoredMetadataSchema
>;
export type ActionItemStatus = ActionItemMetadata["status"];
export type ActionItemSourceRef = z.output<typeof actionItemSourceRefSchema>;

export type ActionItemOrigin =
  | {
      kind: "conversation";
      conversationId: string;
      interfaceType: string;
      channelId: string;
      channelName?: string;
      /** When the conversation it came from ended. */
      capturedAt: string;
    }
  | { kind: "inbox"; sourceRef: ActionItemSourceRef; capturedAt: string }
  /** Added on the board by hand; `capturedAt` is when. */
  | { kind: "board"; capturedAt: string };

/** Where an action item came from; the schema guarantees one complete answer. */
export function actionItemOrigin(
  metadata: Pick<
    ActionItemMetadata,
    | "origin"
    | "conversationId"
    | "interfaceType"
    | "channelId"
    | "channelName"
    | "sourceRef"
    | "capturedAt"
  >,
): ActionItemOrigin {
  if (metadata.origin === "board") {
    return { kind: "board", capturedAt: metadata.capturedAt };
  }
  if (metadata.origin === "inbox" && metadata.sourceRef) {
    return {
      kind: "inbox",
      sourceRef: metadata.sourceRef,
      capturedAt: metadata.capturedAt,
    };
  }
  if (
    metadata.conversationId !== undefined &&
    metadata.interfaceType !== undefined &&
    metadata.channelId !== undefined
  ) {
    return {
      kind: "conversation",
      conversationId: metadata.conversationId,
      interfaceType: metadata.interfaceType,
      channelId: metadata.channelId,
      ...(metadata.channelName ? { channelName: metadata.channelName } : {}),
      capturedAt: metadata.capturedAt,
    };
  }
  throw new Error("Action item metadata names no complete origin");
}

export const actionItemSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"action-item">;
    metadata: typeof actionItemStoredMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("action-item"),
  metadata: actionItemStoredMetadataSchema,
});

export type ActionItemEntity = z.output<typeof actionItemSchema>;
