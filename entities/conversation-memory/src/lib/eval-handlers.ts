import type {
  BaseEntity,
  Conversation,
  EntityPluginContext,
  Message,
  SearchResult,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../schemas/conversation-memory";
import type { SummaryConfig, SummaryEntity } from "../schemas/summary";
import { SummaryExtractor } from "./summary-extractor";
import { ConversationMemoryRetriever } from "./conversation-memory-retriever";
import { SummaryProjector } from "./summary-projector";
import { buildFallbackExcerpt } from "./excerpt";

const evalMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().datetime().optional(),
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
  status: z.string().optional(),
});

const retrieveMemoryInputSchema = z.object({
  query: z.string().optional(),
  conversationId: z.string().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  includeOtherSpaces: z.boolean().optional(),
  memory: z.array(seededMemorySchema).optional(),
});

const decideProjectionInputSchema = z.object({
  conversationId: z.string().default("eval-conversation"),
  existingSummary: z.string().optional(),
  existingMessageCount: z.number().int().min(0).default(0),
  messages: z.array(evalMessageSchema),
});

export function registerSummaryEvalHandlers(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: SummaryConfig;
}): void {
  const { context, logger, config } = params;

  context.eval.registerHandler("summarizeMessages", async (input: unknown) => {
    const parsed = summarizeMessagesInputSchema.parse(input);
    const messages = toEvalMessages(parsed.messages, parsed.conversationId);

    const extractor = new SummaryExtractor(context, logger, config);
    const memory = await extractor.extract(messages);
    return memory.entries.map((entry) => {
      const decisions = memory.decisions
        .filter((item) => item.timeRange.start >= entry.timeRange.start)
        .filter((item) => item.timeRange.end <= entry.timeRange.end)
        .map((item) => item.text);
      const actionItems = memory.actionItems
        .filter((item) => item.timeRange.start >= entry.timeRange.start)
        .filter((item) => item.timeRange.end <= entry.timeRange.end)
        .map((item) => item.text);
      return {
        ...entry,
        decisions,
        actionItems,
        keyPointsText: entry.keyPoints.join("\n"),
        decisionsText: decisions.join("\n"),
        actionItemsText: actionItems.join("\n"),
      };
    });
  });

  context.eval.registerHandler("decideProjection", async (input: unknown) => {
    const parsed = decideProjectionInputSchema.parse(input);
    const messages = toEvalMessages(parsed.messages, parsed.conversationId);

    const existing = parsed.existingSummary
      ? createEvalSummaryEntity({
          conversationId: parsed.conversationId,
          content: parsed.existingSummary,
          messageCount: parsed.existingMessageCount,
          projectionVersion: config.projectionVersion,
        })
      : null;

    const projector = new SummaryProjector(context, logger, config);
    return projector.decideProjection(messages, existing);
  });

  context.eval.registerHandler("retrieveMemory", async (input: unknown) => {
    const parsed = retrieveMemoryInputSchema.parse(input);
    const retrievalContext = parsed.memory
      ? createSeededRetrievalContext(context, parsed.memory)
      : context;
    const retriever = new ConversationMemoryRetriever(retrievalContext);
    return retriever.retrieve(parsed);
  });

  context.eval.registerHandler("projectMessages", async (input: unknown) => {
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
        })
      : null;
    const upserted: BaseEntity[] = [];
    const deleted: Array<{ entityType: string; id: string }> = [];
    const projectionContext = createEvalProjectionContext({
      context,
      conversation,
      messages,
      existing,
      upserted,
      deleted,
      projectionDecision: parsed.projectionDecision,
    });
    const projector = new SummaryProjector(projectionContext, logger, config);
    const result = await projector.projectConversation(parsed.conversationId);

    return {
      result,
      summaries: upserted.filter((entity) => entity.entityType === "summary"),
      decisions: upserted.filter((entity) => entity.entityType === "decision"),
      actionItems: upserted.filter(
        (entity) => entity.entityType === "action-item",
      ),
      deleted,
    };
  });

  context.eval.registerHandler(
    "projectConversation",
    async (input: unknown) => {
      const parsed = projectConversationInputSchema.parse(input);
      const projector = new SummaryProjector(context, logger, config);
      return projector.projectConversation(parsed.conversationId);
    },
  );
}

function createEvalSummaryEntity(params: {
  conversationId: string;
  content: string;
  messageCount: number;
  projectionVersion: number;
}): SummaryEntity {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: params.conversationId,
    entityType: "summary",
    content: params.content,
    contentHash: "eval-existing-summary",
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
  messages: z.infer<typeof evalMessageSchema>[],
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
      metadata: {},
    };
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

function createEvalProjectionContext(params: {
  context: EntityPluginContext;
  conversation: Conversation;
  messages: Message[];
  existing: SummaryEntity | null;
  upserted: BaseEntity[];
  deleted: Array<{ entityType: string; id: string }>;
  projectionDecision: "update" | "append";
}): EntityPluginContext {
  const spaceId = `${params.conversation.interfaceType}:${params.conversation.channelId}`;
  return {
    ...params.context,
    spaces: [spaceId],
    conversations: {
      ...params.context.conversations,
      get: async () => params.conversation,
      getMessages: async () => params.messages,
    },
    ai: {
      ...params.context.ai,
      generateObject: async () => ({
        object: {
          decision: params.projectionDecision,
          rationale: "Forced by eval input",
        },
      }),
    },
    entityService: {
      ...params.context.entityService,
      getEntity: async ({ entityType }: { entityType: string }) =>
        entityType === "summary" ? params.existing : null,
      listEntities: async () => [],
      deleteEntity: async (request: { entityType: string; id: string }) => {
        params.deleted.push(request);
        return true;
      },
      upsertEntity: async <T extends BaseEntity>({ entity }: { entity: T }) => {
        params.upserted.push(entity);
        return {
          entityId: entity.id,
          jobId: "eval-upsert",
          created: true,
          skipped: false,
        };
      },
    },
  } as EntityPluginContext;
}

type SeededMemory = z.infer<typeof seededMemorySchema>;

type EvalMemoryEntity = SummaryEntity | DecisionEntity | ActionItemEntity;

function createSeededRetrievalContext(
  context: EntityPluginContext,
  memory: SeededMemory[],
): EntityPluginContext {
  const entities = memory.map(toMemoryEntity);
  const searchResults: SearchResult<EvalMemoryEntity>[] = entities.map(
    (entity, index) => ({
      entity,
      score: memory[index]?.score ?? 1,
      excerpt: memory[index]?.excerpt ?? buildFallbackExcerpt(entity),
    }),
  );

  return {
    ...context,
    entityService: {
      ...context.entityService,
      search: async () => searchResults,
      listEntities: async ({ entityType }: { entityType: string }) =>
        entities.filter((entity) => entity.entityType === entityType),
    },
  } as EntityPluginContext;
}

function toMemoryEntity(memory: SeededMemory): EvalMemoryEntity {
  if (memory.entityType === "summary") return toSummaryEntity(memory);
  if (memory.entityType === "decision") return toDecisionEntity(memory);
  return toActionItemEntity(memory);
}

function baseMemoryFields(
  memory: SeededMemory,
): Pick<BaseEntity, "id" | "content" | "contentHash" | "created" | "updated"> {
  const updated = memory.updated ?? "2026-01-01T00:00:00.000Z";
  return {
    id: memory.id,
    content: memory.content,
    contentHash: computeContentHash(memory.content),
    created: updated,
    updated,
  };
}

function toSummaryEntity(memory: SeededMemory): SummaryEntity {
  return {
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
    },
  };
}

function toDecisionEntity(memory: SeededMemory): DecisionEntity {
  return {
    ...baseMemoryFields(memory),
    entityType: "decision",
    metadata: {
      conversationId: memory.conversationId,
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      spaceId: `${memory.interfaceType}:${memory.channelId}`,
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: memory.conversationId,
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: memory.status === "superseded" ? "superseded" : "active",
    },
  };
}

function toActionItemEntity(memory: SeededMemory): ActionItemEntity {
  const status =
    memory.status === "done" || memory.status === "dropped"
      ? memory.status
      : "open";
  return {
    ...baseMemoryFields(memory),
    entityType: "action-item",
    metadata: {
      conversationId: memory.conversationId,
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      spaceId: `${memory.interfaceType}:${memory.channelId}`,
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: memory.conversationId,
      sourceMessageCount: 2,
      projectionVersion: 1,
      status,
    },
  };
}
