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
} from "@brains/sdk/entities";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import {
  appendMemoryProjectionEnvelope,
  mergeProjectedMemoryEntities,
  parseMemoryProjectionEnvelope,
  type MemoryProjectionEnvelope,
  type ProjectedMemoryWrite,
} from "./memory-projection-envelope";
import { SummaryProjector } from "./summary-projector";
import { SummarySourceReader } from "./summary-source-reader";
import { evaluateSummaryEligibility } from "./summary-space-eligibility";
import type { SummaryConfig } from "../schemas/summary-config";
import { summaryMetadataSchema, type SummaryEntity } from "../schemas/summary";

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
  const changed = trigger.inputs.filter(
    (input) =>
      input.sourceType === CONVERSATION_SOURCE_TYPE &&
      input.operation === "upsert",
  );
  const sourceReader = new SummarySourceReader(context.conversations, config);

  const [appInfo, ...selected] = await Promise.all([
    context.appInfo(),
    ...changed.map(async (input): Promise<SelectedConversation | null> => {
      const conversation = await context.conversations.get(input.sourceId);
      if (!conversation) return null;
      if (
        !evaluateSummaryEligibility({
          conversation,
          spaces: context.spaces,
        }).eligible
      ) {
        return null;
      }

      const source = await sourceReader.readKnownConversation(conversation);
      if (source.messages.length === 0) return null;
      const candidate = await context.entities.getEntity<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        id: conversation.id,
        visibilityScope: config.memoryVisibility,
      });
      const existing =
        candidate?.visibility === config.memoryVisibility ? candidate : null;
      return toSelectedConversation(
        source.conversation,
        source.messages,
        source.sourceHash,
        existing,
      );
    }),
  ]);

  return {
    conversations: selected.filter(
      (conversation): conversation is SelectedConversation =>
        conversation !== null,
    ),
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

function toProjectionWrite(entity: BaseEntity): ProjectedMemoryWrite {
  return {
    id: entity.id,
    entityType: entity.entityType,
    content: entity.content,
    metadata: ProjectionJsonObjectSchema.parse(entity.metadata),
    visibility: entity.visibility,
  };
}

function createCaptureEntityAccess(input: {
  existing: SummaryEntity | null;
  captured: BaseEntity[];
}): JobEntityAccess {
  const written = (
    entity: BaseEntity,
  ): { entityId: string; jobId: string; skipped: boolean } => {
    input.captured.push(entity);
    return { entityId: entity.id, jobId: "summary-rule", skipped: false };
  };
  return {
    getEntity: async <T>({ entityType }: { entityType: string }) =>
      (entityType === SUMMARY_ENTITY_TYPE ? input.existing : null) as T | null,
    listEntities: async <T>() => [] as T[],
    find: async () => null,
    getEntityTypes: () => [
      SUMMARY_ENTITY_TYPE,
      DECISION_ENTITY_TYPE,
      ACTION_ITEM_ENTITY_TYPE,
    ],
    search: async () => [],
    get: async () => null,
    delete: async () => true,
    create: async <T extends BaseEntity>(
      entity: EntityInput<T>,
    ): Promise<EntityMutationResult> =>
      written(entity as unknown as BaseEntity),
    update: async <T extends BaseEntity>(
      entity: T,
    ): Promise<EntityMutationResult> => written(entity),
    createPending: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<{ entityId: string; created: boolean }> => {
      written(entity as unknown as BaseEntity);
      return { entityId: entity.id, created: true };
    },
    saveProcessed: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ) => written(entity as unknown as BaseEntity),
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
    const captured: BaseEntity[] = [];
    const projector = new SummaryProjector(
      {
        ai: context.ai,
        entities: createCaptureEntityAccess({
          existing: projectorExisting,
          captured,
        }),
        conversations: {
          get: async (): Promise<Conversation> => conversation,
          getMessages: async (): Promise<Message[]> => messages,
        },
        spaces: [`${conversation.interfaceType}:${conversation.channelId}`],
      },
      context.logger,
      config,
    );
    const result = await projector.projectConversation(source.id);
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
      deriveSummaryProjection(input, context, signal, config),
  });
}

export type { SummaryEntity };
