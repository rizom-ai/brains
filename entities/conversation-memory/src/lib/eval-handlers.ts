import {
  actorRefFromLegacy,
  computeContentHash,
  contentVisibilitySchema,
  z,
  type BaseEntity,
  type ContentVisibility,
  type Conversation,
  type EntityEvalDeclaration,
  type JobEntityAccess,
  type Message,
  type SearchResult,
  type EntitySchema,
} from "@brains/sdk/entities";
import {
  actionItemSchema,
  decisionSchema,
  type ActionItemEntity,
  type DecisionEntity,
} from "../schemas/conversation-memory";
import {
  summarySchema,
  type SummaryEntity,
  type SummaryTimeRange,
} from "../schemas/summary";
import type { SummaryConfig } from "../schemas/summary-config";
import { ConversationMemoryRetriever } from "./conversation-memory-retriever";
import {
  decideSummaryProjection,
  deriveConversationMemory,
} from "./summary-derivation";
import { conversationMemoryAgentContext } from "./agent-context-provider";
import { buildFallbackExcerpt } from "./excerpt";
import { runMemoryRuleChain } from "./memory-rule-chain-runner";
import { parseSummaryBody } from "./summary-body";
import {
  parseMemoryProjectionEnvelope,
  type ProjectedMemoryWrite,
} from "./memory-projection-envelope";
import { getConversationSpaceId } from "./summary-space-eligibility";
import { SUMMARY_AI_TEMPLATE_NAME } from "./constants";

const messageRoleSchema = z.enum(["user", "assistant"]);

const conversationMessageActorSchema = z.object({
  actorId: z.string(),
  userId: z.string().optional(),
  canonicalId: z.string().optional(),
  interfaceType: z.string(),
  role: messageRoleSchema,
  displayName: z.string().optional(),
  username: z.string().optional(),
  isBot: z.boolean().optional(),
});

const conversationMessageSourceSchema = z.object({
  messageId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  threadId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const evalMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string(),
  timestamp: z.string().datetime().optional(),
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
});

const summarizeMessagesInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  messages: z.array(evalMessageSchema),
});

const projectConversationInputSchema = z.object({
  conversationId: z.string(),
});

const projectMessagesInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  interfaceType: z.string().default("eval"),
  channelId: z.string().default("eval-channel"),
  channelName: z.string().optional(),
  projectionDecision: z.enum(["update", "append"]).default("update"),
  existingSummary: z.string().optional(),
  existingMessageCount: z.number().int().min(0).default(0),
  messages: z.array(evalMessageSchema),
});

const seededActorReferenceSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
});

const seededParticipantSchema = seededActorReferenceSchema.extend({
  roles: z.array(z.enum(["user", "assistant", "system"])).default(["user"]),
  sourceActorIds: z.array(z.string()).optional(),
});

const seededAssigneeSchema = z.object({
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  displayName: z.string(),
});

const seededMemorySchema = z.object({
  id: z.string(),
  entityType: z.enum(["summary", "decision", "action-item"]),
  content: z.string(),
  excerpt: z.string().optional(),
  score: z.number().optional(),
  conversationId: z.string(),
  interfaceType: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  updated: z.string().datetime().optional(),
  visibility: contentVisibilitySchema,
  status: z.string().optional(),
  participants: z.array(seededParticipantSchema).optional(),
  decidedBy: z.array(seededActorReferenceSchema).optional(),
  mentionedBy: z.array(seededActorReferenceSchema).optional(),
  assignedTo: z.array(seededAssigneeSchema).optional(),
  requestedBy: z.array(seededActorReferenceSchema).optional(),
});

const retrieveMemoryInputSchema = z.object({
  query: z.string().optional(),
  conversationId: z.string().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  includeOtherSpaces: z.boolean().optional(),
  actorId: z.string().optional(),
  canonicalId: z.string().optional(),
  visibilityScope: contentVisibilitySchema.optional(),
  memory: z.array(seededMemorySchema).optional(),
});

const agentContextInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  message: z.string(),
  interfaceType: z.string().default("eval"),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  userPermissionLevel: z
    .enum(["admin", "trusted", "public"])
    .default("trusted"),
  memory: z.array(seededMemorySchema).optional(),
});

const decideProjectionInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  existingSummary: z.string().optional(),
  existingMessageCount: z.number().int().min(0).default(0),
  messages: z.array(evalMessageSchema),
});

/**
 * Evals, declared. Each is handed the same narrow context a job gets, plus
 * fixtures — no plugin context to reach past.
 */
export function summaryEvalHandlers(
  config: SummaryConfig,
  extractionTemplateName: string = SUMMARY_AI_TEMPLATE_NAME,
): EntityEvalDeclaration {
  return {
    summarizeMessages: async (input, { ai, logger }): Promise<unknown> => {
      const parsed = summarizeMessagesInputSchema.parse(input);
      const messages = toEvalMessages(parsed.messages, parsed.conversationId);
      const conversation = createEvalConversation({
        conversationId: parsed.conversationId,
        interfaceType: "eval",
        channelId: "eval-channel",
        messages,
      });
      const chain = await runMemoryRuleChain(
        {
          conversation,
          messages,
          existingSummary: null,
          projectionDecision: "update",
        },
        { ai, logger },
        config,
        extractionTemplateName,
      );
      const summary = chain.summaries[0];
      if (!summary) return [];
      const envelope = parseMemoryProjectionEnvelope(summary.content);
      return parseSummaryBody(summary.content).entries.map((entry) => {
        const decisions = envelope
          ? memoryTextsWithin(envelope.decisions, entry.timeRange)
          : [];
        const actionItems = envelope
          ? memoryTextsWithin(envelope.actionItems, entry.timeRange)
          : [];
        return {
          ...entry,
          decisions,
          actionItems,
          keyPointsText: entry.keyPoints.join("\n"),
          decisionsText: decisions.join("\n"),
          actionItemsText: actionItems.join("\n"),
        };
      });
    },

    decideProjection: async (input, { ai }): Promise<unknown> => {
      const parsed = decideProjectionInputSchema.parse(input);
      const messages = toEvalMessages(parsed.messages, parsed.conversationId);

      const existing = parsed.existingSummary
        ? createEvalSummaryEntity({
            conversationId: parsed.conversationId,
            content: parsed.existingSummary,
            messageCount: parsed.existingMessageCount,
            projectionVersion: config.projectionVersion,
            visibility: config.memoryVisibility,
          })
        : null;

      return decideSummaryProjection(ai, messages, existing);
    },

    retrieveMemory: async (
      input,
      { entities, conversations },
    ): Promise<unknown> => {
      const parsed = retrieveMemoryInputSchema.parse(input);
      const retriever = new ConversationMemoryRetriever({
        entities: parsed.memory ? seededEntityAccess(parsed.memory) : entities,
        conversations,
      });
      const {
        actorId,
        canonicalId,
        memory: _memory,
        ...retrievalInput
      } = parsed;
      const legacyIdentity = actorId ?? canonicalId;
      return retriever.retrieve({
        ...retrievalInput,
        ...(legacyIdentity
          ? {
              identity: actorRefFromLegacy({
                actorId: legacyIdentity,
                interfaceType: sourceFromLegacyActorId(legacyIdentity),
                role: "user",
                ...(canonicalId ? { canonicalId } : {}),
              }),
            }
          : {}),
      });
    },

    buildAgentContext: async (
      input,
      { entities, conversations, logger },
    ): Promise<unknown> => {
      const parsed = agentContextInputSchema.parse(input);
      return {
        items: await conversationMemoryAgentContext({
          request: parsed,
          entities: parsed.memory
            ? seededEntityAccess(parsed.memory)
            : entities,
          conversations,
          logger,
        }),
      };
    },

    projectMessages: async (input, { ai, logger }): Promise<unknown> => {
      const parsed = projectMessagesInputSchema.parse(input);
      const messages = toEvalMessages(parsed.messages, parsed.conversationId);
      const conversation = createEvalConversation({
        conversationId: parsed.conversationId,
        interfaceType: parsed.interfaceType,
        channelId: parsed.channelId,
        channelName: parsed.channelName,
        messages,
      });
      const existing = parsed.existingSummary
        ? createEvalSummaryEntity({
            conversationId: parsed.conversationId,
            content: parsed.existingSummary,
            messageCount: parsed.existingMessageCount,
            projectionVersion: config.projectionVersion,
            visibility: config.memoryVisibility,
          })
        : null;
      const chain = await runMemoryRuleChain(
        {
          conversation,
          messages,
          existingSummary: existing,
          projectionDecision: parsed.projectionDecision,
        },
        { ai, logger },
        config,
        extractionTemplateName,
      );

      return {
        result: {
          skipped: chain.skipped,
          projectionDecision: chain.projectionDecision,
          summaryId: chain.summaries[0]?.id,
        },
        summaries: chain.summaries,
        decisions: chain.decisions,
        actionItems: chain.actionItems,
        deleted: chain.deleted,
      };
    },

    projectConversation: async (
      input,
      { ai, logger, entities, conversations },
    ): Promise<unknown> => {
      const parsed = projectConversationInputSchema.parse(input);
      return deriveConversationMemory(
        { ai, entities, conversations, spaces: [] },
        logger,
        config,
        parsed.conversationId,
        extractionTemplateName,
      );
    },
  };
}

function createEvalSummaryEntity(params: {
  conversationId: string;
  content: string;
  messageCount: number;
  projectionVersion: number;
  visibility: ContentVisibility;
}): SummaryEntity {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: params.conversationId,
    entityType: "summary",
    content: params.content,
    contentHash: "eval-existing-summary",
    visibility: params.visibility,
    created: now,
    updated: now,
    metadata: {
      conversationId: params.conversationId,
      channelId: "eval-channel",
      interfaceType: "eval",
      messageCount: params.messageCount,
      entryCount: 1,
      sourceHash: "eval-source-hash",
      projectionVersion: params.projectionVersion,
    },
  };
}

function toEvalMessages(
  messages: z.output<typeof evalMessageSchema>[],
  conversationId: string,
): Message[] {
  return messages.map((message, index): Message => {
    const timestamp =
      message.timestamp ??
      new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    return {
      id: `eval-message-${index + 1}`,
      conversationId,
      role: message.role,
      content: message.content,
      timestamp,
      metadata: {
        ...(message.actor
          ? {
              actor: {
                identity: actorRefFromLegacy(message.actor),
                interfaceType: message.actor.interfaceType,
                role: message.actor.role,
                ...(message.actor.displayName
                  ? { displayName: message.actor.displayName }
                  : {}),
                ...(message.actor.username
                  ? { username: message.actor.username }
                  : {}),
                ...(message.actor.isBot !== undefined
                  ? { isBot: message.actor.isBot }
                  : {}),
              },
            }
          : {}),
        ...(message.source ? { source: message.source } : {}),
      },
    };
  });
}

function memoryTextsWithin(
  items: ProjectedMemoryWrite[],
  range: SummaryTimeRange,
): string[] {
  return items.flatMap((item) => {
    const timeRange = item.metadata["timeRange"];
    if (
      !timeRange ||
      typeof timeRange !== "object" ||
      !("start" in timeRange) ||
      !("end" in timeRange) ||
      typeof timeRange["start"] !== "string" ||
      typeof timeRange["end"] !== "string" ||
      timeRange["start"] < range.start ||
      timeRange["end"] > range.end
    ) {
      return [];
    }
    const body = item.content
      .replace(/^---\n[\s\S]*?\n---\n*/, "")
      .replace(/^# [^\n]+\n+/, "")
      .trim();
    return body ? [body] : [];
  });
}

function createEvalConversation(params: {
  conversationId: string;
  interfaceType: string;
  channelId: string;
  channelName?: string | undefined;
  messages: Message[];
}): Conversation {
  const firstMessage = params.messages[0];
  const lastMessage = params.messages[params.messages.length - 1];
  const startedAt = firstMessage?.timestamp ?? "2026-01-01T00:00:00.000Z";
  const lastActiveAt = lastMessage?.timestamp ?? startedAt;
  return {
    id: params.conversationId,
    sessionId: params.conversationId,
    interfaceType: params.interfaceType,
    channelId: params.channelId,
    ...(params.channelName ? { channelName: params.channelName } : {}),
    startedAt,
    lastActiveAt,
    createdAt: startedAt,
    updatedAt: lastActiveAt,
    metadata: {},
  };
}

type SeededMemory = z.output<typeof seededMemorySchema>;

type EvalMemoryEntity = SummaryEntity | DecisionEntity | ActionItemEntity;

/**
 * Entity reads over memory an eval planted, rather than whatever the brain
 * happens to hold. Reads only: an eval measures retrieval, it does not write.
 */
function seededEntityAccess(memory: SeededMemory[]): JobEntityAccess {
  const entities = memory.map(toMemoryEntity);
  const searchResults: SearchResult<EvalMemoryEntity>[] = entities.map(
    (entity, index) => ({
      entity,
      score: memory[index]?.score ?? 1,
      excerpt: memory[index]?.excerpt ?? buildFallbackExcerpt(entity),
    }),
  );
  const refuse = (): never => {
    throw new Error("A retrieval eval does not write entities");
  };

  // Each read carries the contract's overload pair: the widened form hands
  // back the seeded entities as themselves, and the schema-bearing form parses
  // them through the schema the caller supplied rather than asserting a shape.
  async function search(): Promise<SearchResult<BaseEntity>[]>;
  async function search<T extends BaseEntity>(
    request: unknown,
    schema: EntitySchema<T>,
  ): Promise<SearchResult<T>[]>;
  async function search<T extends BaseEntity>(
    _request?: unknown,
    schema?: EntitySchema<T>,
  ): Promise<SearchResult<BaseEntity>[] | SearchResult<T>[]> {
    return schema
      ? searchResults.map((result) => ({
          ...result,
          entity: schema.parse(result.entity),
        }))
      : searchResults;
  }

  async function listEntities(request: {
    entityType: string;
  }): Promise<BaseEntity[]>;
  async function listEntities<T extends BaseEntity>(
    request: { entityType: string },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntities<T extends BaseEntity>(
    { entityType }: { entityType: string },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity[] | T[]> {
    const matches = entities.filter(
      (entity) => entity.entityType === entityType,
    );
    return schema ? matches.map((entity) => schema.parse(entity)) : matches;
  }

  async function getEntity(request: { id: string }): Promise<BaseEntity | null>;
  async function getEntity<T extends BaseEntity>(
    request: { id: string },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function getEntity<T extends BaseEntity>(
    { id }: { id: string },
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const found = entities.find((entity) => entity.id === id) ?? null;
    if (!found) return null;
    return schema ? schema.parse(found) : found;
  }

  async function find(
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null>;
  async function find<T extends BaseEntity>(
    entityType: string,
    id: string,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  async function find<T extends BaseEntity>(
    entityType: string,
    id: string,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const found =
      entities.find(
        (entity) => entity.entityType === entityType && entity.id === id,
      ) ?? null;
    if (!found) return null;
    return schema ? schema.parse(found) : found;
  }

  return {
    search,
    listEntities,
    getEntity,
    find,
    getEntityTypes: () => [...new Set(entities.map((e) => e.entityType))],
    getEntityCounts: async () =>
      [...new Set(entities.map((e) => e.entityType))].map((entityType) => ({
        entityType,
        count: entities.filter((entity) => entity.entityType === entityType)
          .length,
      })),
    get: async () => null,
    create: refuse,
    update: refuse,
    delete: refuse,
    createPending: refuse,
    saveProcessed: refuse,
  };
}

function toMemoryEntity(memory: SeededMemory): EvalMemoryEntity {
  if (memory.entityType === "summary") return toSummaryEntity(memory);
  if (memory.entityType === "decision") return toDecisionEntity(memory);
  return toActionItemEntity(memory);
}

function baseMemoryFields(
  memory: SeededMemory,
): Pick<
  BaseEntity,
  "id" | "content" | "contentHash" | "created" | "updated"
> & { visibility: ContentVisibility } {
  const updated = memory.updated ?? "2026-01-01T00:00:00.000Z";
  return {
    id: memory.id,
    content: memory.content,
    contentHash: computeContentHash(memory.content),
    visibility: memory.visibility,
    created: updated,
    updated,
  };
}

function toSummaryEntity(memory: SeededMemory): SummaryEntity {
  return summarySchema.parse({
    ...baseMemoryFields(memory),
    entityType: "summary",
    metadata: {
      conversationId: memory.conversationId,
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      messageCount: 3,
      entryCount: 1,
      sourceHash: `source-${memory.id}`,
      projectionVersion: 1,
      ...(memory.participants ? { participants: memory.participants } : {}),
    },
  });
}

function toDecisionEntity(memory: SeededMemory): DecisionEntity {
  return decisionSchema.parse({
    ...baseMemoryFields(memory),
    entityType: "decision",
    metadata: {
      conversationId: memory.conversationId,
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      spaceId: getConversationSpaceId(memory),
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: memory.conversationId,
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: memory.status === "superseded" ? "superseded" : "active",
      ...(memory.decidedBy ? { decidedBy: memory.decidedBy } : {}),
      ...(memory.mentionedBy ? { mentionedBy: memory.mentionedBy } : {}),
    },
  });
}

function toActionItemEntity(memory: SeededMemory): ActionItemEntity {
  const status =
    memory.status === "done" || memory.status === "dropped"
      ? memory.status
      : "open";
  return actionItemSchema.parse({
    ...baseMemoryFields(memory),
    entityType: "action-item",
    metadata: {
      conversationId: memory.conversationId,
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      spaceId: getConversationSpaceId(memory),
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: memory.conversationId,
      sourceMessageCount: 2,
      projectionVersion: 1,
      status,
      ...(memory.assignedTo ? { assignedTo: memory.assignedTo } : {}),
      ...(memory.requestedBy ? { requestedBy: memory.requestedBy } : {}),
    },
  });
}

function sourceFromLegacyActorId(actorId: string): string {
  const separator = actorId.indexOf(":");
  return separator > 0 ? actorId.slice(0, separator) : "legacy";
}
