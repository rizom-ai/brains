import {
  CONVERSATION_SOURCE_TYPE,
  PROJECTION_ABSTAINED,
  ProjectionJsonObjectSchema,
  computeContentHash,
  defineProjectionRule,
  z,
  type BaseEntity,
  type Conversation,
  type EntityInput,
  type EntityMutationResult,
  type JobEntityAccess,
  type Message,
  type ProjectionAbstention,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionJsonObject,
  type ProjectionRule,
  type ProjectionWriteIntent,
  type EntitySchema,
} from "@brains/sdk/entities";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_AI_TEMPLATE_NAME,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import {
  appendMemoryProjectionEnvelope,
  mergeProjectedMemoryEntities,
  parseMemoryProjectionEnvelope,
  type MemoryProjectionEnvelope,
  type ProjectedMemoryWrite,
} from "./memory-projection-envelope";
import { deriveConversationMemory } from "./summary-derivation";
import { computeSummarySourceHash } from "./summary-source-reader";
import { evaluateSummaryEligibility } from "./summary-space-eligibility";
import type { SummaryConfig } from "../schemas/summary-config";
import {
  summaryMetadataSchema,
  summarySchema,
  type SummaryEntity,
} from "../schemas/summary";

export const SUMMARY_PROJECTION_ID = "summary-derivation";

interface SelectedMessage extends ProjectionJsonObject {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata: ProjectionJsonObject;
}

interface SelectedSummary extends ProjectionJsonObject {
  content: string;
  visibility: "public" | "shared" | "restricted";
  created: string;
  updated: string;
  metadata: ProjectionJsonObject;
}

interface SelectedConversation extends ProjectionJsonObject {
  id: string;
  sessionId: string;
  channelId: string;
  channelName: string | null;
  interfaceType: string;
  personId: string | null;
  startedAt: string;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
  metadata: ProjectionJsonObject;
  messages: SelectedMessage[];
  sourceHash: string;
  existing: SelectedSummary | null;
}

export interface SummaryProjectionInput extends ProjectionJsonObject {
  conversations: SelectedConversation[];
  memoryVisibility: "public" | "shared" | "restricted";
  model: string;
}

const messageSchema: z.ZodType<SelectedMessage> = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string(),
  metadata: ProjectionJsonObjectSchema,
});

const existingSummarySchema: z.ZodType<SelectedSummary> = z.object({
  content: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  created: z.string(),
  updated: z.string(),
  metadata: ProjectionJsonObjectSchema,
});

const conversationSchema: z.ZodType<SelectedConversation> = z.object({
  id: z.string(),
  sessionId: z.string(),
  channelId: z.string(),
  channelName: z.string().nullable(),
  interfaceType: z.string(),
  personId: z.string().nullable(),
  startedAt: z.string(),
  lastActiveAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: ProjectionJsonObjectSchema,
  messages: z.array(messageSchema),
  sourceHash: z.string(),
  existing: existingSummarySchema.nullable(),
});

const summaryProjectionInputSchema: z.ZodType<SummaryProjectionInput> =
  z.object({
    conversations: z.array(conversationSchema),
    memoryVisibility: z.enum(["public", "shared", "restricted"]),
    model: z.string(),
  });

function toSelectedMessage(message: Message): SelectedMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    timestamp: message.timestamp,
    metadata: ProjectionJsonObjectSchema.parse(message.metadata),
  };
}

function toSelectedConversation(
  conversation: Conversation,
  messages: Message[],
  sourceHash: string,
  existing: SummaryEntity | null,
): SelectedConversation {
  return {
    id: conversation.id,
    sessionId: conversation.sessionId,
    channelId: conversation.channelId,
    channelName: conversation.channelName ?? null,
    interfaceType: conversation.interfaceType,
    personId: conversation.personId ?? null,
    startedAt: conversation.startedAt,
    lastActiveAt: conversation.lastActiveAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    metadata: ProjectionJsonObjectSchema.parse(conversation.metadata),
    messages: messages.map(toSelectedMessage),
    sourceHash,
    existing: existing
      ? {
          content: existing.content,
          visibility: existing.visibility,
          created: existing.created,
          updated: existing.updated,
          metadata: ProjectionJsonObjectSchema.parse(existing.metadata),
        }
      : null,
  };
}

export async function selectSummaryProjectionInput(
  trigger: Parameters<ProjectionRule["selectInput"]>[0],
  context: ProjectionInputContext,
  config: SummaryConfig,
): Promise<SummaryProjectionInput> {
  const changedIds = [
    ...new Set(
      trigger.inputs
        .filter(
          (input) =>
            input.sourceType === CONVERSATION_SOURCE_TYPE &&
            input.operation === "upsert",
        )
        .map(({ sourceId }) => sourceId),
    ),
  ];
  const [appInfo, sources, existingSummaries] = await Promise.all([
    context.appInfo(),
    context.conversations.getManyWithMessages({
      ids: changedIds,
      messageLimit: config.maxSourceMessages,
    }),
    context.entities.getEntities({
      entityType: SUMMARY_ENTITY_TYPE,
      ids: changedIds,
      visibilityScope: config.memoryVisibility,
    }),
  ]);
  const sourceById = new Map(
    sources.map((source) => [source.conversation.id, source]),
  );
  const existingById = new Map(
    existingSummaries.flatMap((candidate): Array<[string, SummaryEntity]> => {
      const parsed = summarySchema.safeParse(candidate);
      return parsed.success &&
        parsed.data.visibility === config.memoryVisibility
        ? [[parsed.data.id, parsed.data]]
        : [];
    }),
  );
  const selected = changedIds.flatMap((id): SelectedConversation[] => {
    const source = sourceById.get(id);
    if (!source || source.messages.length === 0) return [];
    if (
      !evaluateSummaryEligibility({
        conversation: source.conversation,
        spaces: context.spaces,
      }).eligible
    ) {
      return [];
    }
    const messages = [...source.messages];
    return [
      toSelectedConversation(
        source.conversation,
        messages,
        computeSummarySourceHash(
          source.conversation,
          messages,
          config.projectionVersion,
        ),
        existingById.get(id) ?? null,
      ),
    ];
  });

  return {
    conversations: selected,
    memoryVisibility: config.memoryVisibility,
    model: appInfo.ai.model,
  };
}

function toConversation(source: SelectedConversation): Conversation {
  return {
    id: source.id,
    sessionId: source.sessionId,
    interfaceType: source.interfaceType,
    channelId: source.channelId,
    ...(source.personId ? { personId: source.personId } : {}),
    ...(source.channelName ? { channelName: source.channelName } : {}),
    startedAt: source.startedAt,
    lastActiveAt: source.lastActiveAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    metadata: source.metadata,
  };
}

function toMessages(source: SelectedConversation): Message[] {
  return source.messages.map((message) => ({
    ...message,
    conversationId: source.id,
  }));
}

function toSummaryEntity(source: SelectedConversation): SummaryEntity | null {
  const existing = source.existing;
  if (!existing) return null;
  return {
    id: source.id,
    entityType: SUMMARY_ENTITY_TYPE,
    content: existing.content,
    contentHash: computeContentHash(existing.content),
    visibility: existing.visibility,
    created: existing.created,
    updated: existing.updated,
    metadata: summaryMetadataSchema.parse(existing.metadata),
  };
}

/**
 * What the capture harness records about a write.
 *
 * A write arrives as `EntityInput`, which is not a whole entity — the runtime
 * fills in the timestamps and hash. Recording only the fields a projection
 * write is built from is what lets the harness hold them without claiming
 * they are complete entities.
 */
interface CapturedWrite {
  readonly id: string;
  readonly entityType: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly visibility?: BaseEntity["visibility"] | undefined;
}

const capturedVisibilitySchema = z.enum(["public", "shared", "restricted"]);

/**
 * Narrow a write to the fields a projection write is built from.
 *
 * A write arrives as `EntityInput`, whose id and visibility are both optional
 * and whose visibility is the raw, pre-normalisation form — so both are read
 * through a check rather than assumed.
 */
function captureOf(entity: {
  readonly id?: string | undefined;
  readonly entityType: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly visibility?: unknown;
}): CapturedWrite {
  const visibility = capturedVisibilitySchema.safeParse(entity.visibility);
  return {
    id: entity.id ?? "",
    entityType: entity.entityType,
    content: entity.content,
    metadata: entity.metadata,
    ...(visibility.success ? { visibility: visibility.data } : {}),
  };
}

function toProjectionWrite(entity: CapturedWrite): ProjectedMemoryWrite {
  return {
    id: entity.id,
    entityType: entity.entityType,
    content: entity.content,
    metadata: ProjectionJsonObjectSchema.parse(entity.metadata),
    visibility: entity.visibility ?? "public",
  };
}

function createCaptureEntityAccess(input: {
  existing: SummaryEntity | null;
  captured: CapturedWrite[];
}): JobEntityAccess {
  const written = (
    entity: CapturedWrite,
  ): { entityId: string; jobId: string; skipped: boolean } => {
    input.captured.push(entity);
    return { entityId: entity.id, jobId: "summary-rule", skipped: false };
  };
  // The reads carry the contract's overload pair, so the schema-bearing form
  // parses the stand-in rather than asserting a shape onto it.
  async function getEntityStub(request: {
    entityType: string;
  }): Promise<BaseEntity | null>;
  async function getEntityStub<T extends BaseEntity>(
    request: { entityType: string },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntityStub<T extends BaseEntity>(
    { entityType }: { entityType: string },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const found = entityType === SUMMARY_ENTITY_TYPE ? input.existing : null;
    if (!found) return null;
    return schema ? schema.parse(found) : found;
  }
  async function listEntitiesStub(): Promise<BaseEntity[]>;
  async function listEntitiesStub<T extends BaseEntity>(
    request: unknown,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntitiesStub(): Promise<never[]> {
    return [];
  }
  return {
    getEntity: getEntityStub,
    listEntities: listEntitiesStub,
    find: async () => null,
    getEntityTypes: () => [
      SUMMARY_ENTITY_TYPE,
      DECISION_ENTITY_TYPE,
      ACTION_ITEM_ENTITY_TYPE,
    ],
    getEntityCounts: async () => [],
    search: async () => [],
    get: async () => null,
    delete: async () => true,
    create: async <T extends BaseEntity>(
      entity: EntityInput<T>,
    ): Promise<EntityMutationResult> => written(captureOf(entity)),
    update: async <T extends BaseEntity>(
      entity: T,
    ): Promise<EntityMutationResult> => written(captureOf(entity)),
    createPending: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<{ entityId: string; created: boolean }> => {
      written(captureOf(entity));
      return { entityId: entity.id, created: true };
    },
    saveProcessed: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ) => written(captureOf(entity)),
  };
}

function mergeEnvelope(
  previous: MemoryProjectionEnvelope | null,
  projected: MemoryProjectionEnvelope,
  decision: "update" | "append",
): MemoryProjectionEnvelope {
  if (decision !== "append" || !previous) return projected;
  return {
    version: 1,
    decisions: mergeProjectedMemoryEntities(
      previous.decisions,
      projected.decisions,
    ),
    actionItems: mergeProjectedMemoryEntities(
      previous.actionItems,
      projected.actionItems,
    ),
  };
}

export async function deriveSummaryProjection(
  input: SummaryProjectionInput,
  context: ProjectionExecutionContext,
  signal: AbortSignal,
  config: SummaryConfig,
  extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
): Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention> {
  if (input.conversations.length === 0) return PROJECTION_ABSTAINED;

  const intents: ProjectionWriteIntent[] = [];
  for (const source of input.conversations) {
    if (signal.aborted) throw signal.reason;

    const conversation = toConversation(source);
    const messages = toMessages(source);
    const storedExisting = toSummaryEntity(source);
    const previousEnvelope = storedExisting
      ? parseMemoryProjectionEnvelope(storedExisting.content)
      : null;
    // A pre-envelope summary cannot supply a complete downstream desired set.
    // Treat its first post-upgrade change as a full update rather than appending a
    // partial envelope that would make old memory look authoritative.
    const projectorExisting = previousEnvelope ? storedExisting : null;
    const captured: CapturedWrite[] = [];
    const result = await deriveConversationMemory(
      {
        ai: context.ai,
        entities: createCaptureEntityAccess({
          existing: projectorExisting,
          captured,
        }),
        conversations: {
          get: async (): Promise<Conversation> => conversation,
          getMessages: async (): Promise<Message[]> => messages,
          getManyWithMessages: async () => [{ conversation, messages }],
        },
        spaces: [`${conversation.interfaceType}:${conversation.channelId}`],
      },
      context.logger,
      config,
      source.id,
      extractionTemplateName,
    );
    if (result.skipped) continue;

    const summaryEntity = captured.find(
      (entity) => entity.entityType === SUMMARY_ENTITY_TYPE,
    );
    if (!summaryEntity || !result.projectionDecision) continue;
    const projectedEnvelope: MemoryProjectionEnvelope = {
      version: 1,
      decisions: captured
        .filter((entity) => entity.entityType === DECISION_ENTITY_TYPE)
        .map(toProjectionWrite),
      actionItems: captured
        .filter((entity) => entity.entityType === ACTION_ITEM_ENTITY_TYPE)
        .map(toProjectionWrite),
    };
    const envelope = mergeEnvelope(
      previousEnvelope,
      projectedEnvelope,
      result.projectionDecision,
    );

    intents.push({
      operation: "upsert",
      entity: {
        ...toProjectionWrite(summaryEntity),
        content: appendMemoryProjectionEnvelope(
          summaryEntity.content,
          envelope,
        ),
        visibility: input.memoryVisibility,
      },
    });
  }

  return intents;
}

/** Conversation memory: one additive narrative summary per conversation. */
export function createSummaryProjectionRule(
  config: SummaryConfig,
  extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
): ProjectionRule {
  return defineProjectionRule({
    id: SUMMARY_PROJECTION_ID,
    version: String(config.projectionVersion),
    sources: [{ kind: "conversation" }],
    targetType: SUMMARY_ENTITY_TYPE,
    targets: { authority: "additive" },
    inputSchema: summaryProjectionInputSchema,
    selectInput: async (trigger, context) =>
      selectSummaryProjectionInput(trigger, context, config),
    derive: async (input, context, signal) =>
      deriveSummaryProjection(
        input,
        context,
        signal,
        config,
        extractionTemplateName,
      ),
  });
}

export type { SummaryEntity };
