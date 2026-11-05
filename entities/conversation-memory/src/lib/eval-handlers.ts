import { actionItemSchema, type ActionItemEntity } from "@brains/action-items";
import { actorRefFromLegacy } from "@brains/contracts";
import {
  type BaseEntity,
  type ContentVisibility,
  type EntityPluginContext,
  type SearchResult,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import {
  decisionSchema,
  type DecisionEntity,
} from "../schemas/conversation-memory";
import { summarySchema, type SummaryEntity } from "../schemas/summary";
import { ConversationMemoryRetriever } from "./conversation-memory-retriever";
import { buildConversationMemoryAgentContext } from "./agent-context-provider";
import { buildFallbackExcerpt } from "./excerpt";

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

/** Eval handlers for recalling conversation memory into an agent's context. */
export function registerMemoryEvalHandlers(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;

  context.eval.registerHandler("retrieveMemory", async (input: unknown) => {
    const parsed = retrieveMemoryInputSchema.parse(input);
    const retrievalContext = parsed.memory
      ? createSeededRetrievalContext(context, parsed.memory)
      : context;
    const retriever = new ConversationMemoryRetriever(retrievalContext);
    const { actorId, canonicalId, memory: _memory, ...retrievalInput } = parsed;
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
  });

  context.eval.registerHandler("buildAgentContext", async (input: unknown) => {
    const parsed = agentContextInputSchema.parse(input);
    const retrievalContext = parsed.memory
      ? createSeededRetrievalContext(context, parsed.memory)
      : context;
    return buildConversationMemoryAgentContext(retrievalContext, parsed);
  });
}

type SeededMemory = z.output<typeof seededMemorySchema>;

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

  const seeded: EntityPluginContext = {
    ...context,
    entityService: {
      ...context.entityService,
      search: async () => searchResults,
      listEntities: async ({ entityType }: { entityType: string }) =>
        entities.filter((entity) => entity.entityType === entityType),
    },
  };
  return seeded;
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
      channelId: memory.channelId,
      ...(memory.channelName ? { channelName: memory.channelName } : {}),
      interfaceType: memory.interfaceType,
      messageCount: 3,
      sourceHash: `source-${memory.id}`,
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
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
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
      capturedAt: "2026-01-01T00:01:00.000Z",
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
