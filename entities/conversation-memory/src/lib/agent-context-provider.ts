import type {
  AgentContextItem,
  AgentContextRequest,
  EntityAgentContextProvider,
  LoggerContract,
} from "@brains/sdk/entities";
import { ConversationMemoryRetriever } from "./conversation-memory-retriever";
import type { RetrievedConversationMemory } from "./conversation-memory-retriever";

const DEFAULT_AGENT_CONTEXT_LIMIT = 5;
const RECENT_AGENT_CONTEXT_LIMIT = 3;

/**
 * What conversation memory offers to ground the agent's next turn.
 *
 * Entity reads arrive already scoped to what the asker may see, so this no
 * longer holds a permission level or derives a visibility scope from one —
 * which is a thing it could previously have got wrong, and the only guard
 * against surfacing restricted memory into a public channel.
 */
export const conversationMemoryAgentContext: EntityAgentContextProvider =
  async ({ request, entities, conversations, logger }) => {
    if (!request.channelId) {
      logAgentContextAudit(logger, request, {
        reason: "no-channel-context",
        items: [],
      });
      return [];
    }

    const retriever = new ConversationMemoryRetriever({
      entities,
      conversations,
    });
    const matched = await retriever.retrieve({
      query: request.message,
      conversationId: request.conversationId,
      interfaceType: request.interfaceType,
      channelId: request.channelId,
      limit: DEFAULT_AGENT_CONTEXT_LIMIT,
    });

    // Fall back to recent same-space memory only when the query matched
    // nothing, so a relevant turn still gets grounding without doubling
    // retrieval work or injecting unrelated recent memory alongside good
    // matches on every turn.
    const recent =
      matched.results.length === 0
        ? await retriever.retrieve({
            conversationId: request.conversationId,
            interfaceType: request.interfaceType,
            channelId: request.channelId,
            limit: RECENT_AGENT_CONTEXT_LIMIT,
          })
        : undefined;

    const fromQueryMatch = matched.results.length > 0;
    const results = fromQueryMatch ? matched.results : (recent?.results ?? []);

    logAgentContextAudit(logger, request, {
      spaceId: matched.spaceId ?? recent?.spaceId,
      reason: results.length > 0 ? "memory-injected" : "no-same-space-memory",
      items: results.map((memory) => toAuditItem(memory, fromQueryMatch)),
    });

    return results.map(toAgentContextItem);
  };

function logAgentContextAudit(
  logger: LoggerContract,
  request: AgentContextRequest,
  audit: {
    spaceId?: string | undefined;
    reason: "memory-injected" | "no-channel-context" | "no-same-space-memory";
    items: ReturnType<typeof toAuditItem>[];
  },
): void {
  logger.info("Conversation memory agent context audit", {
    conversationId: request.conversationId,
    interfaceType: request.interfaceType,
    channelId: request.channelId,
    channelName: request.channelName,
    userPermissionLevel: request.userPermissionLevel,
    spaceId: audit.spaceId,
    reason: audit.reason,
    itemCount: audit.items.length,
    items: audit.items,
  });
}

function toAuditItem(
  memory: RetrievedConversationMemory,
  matchedQuery: boolean,
): {
  id: string;
  entityType: RetrievedConversationMemory["entityType"];
  conversationId: string;
  spaceId: string;
  visibility: RetrievedConversationMemory["visibility"];
  score: number;
  updated: string;
  eligibilityReason: "same-space-query-match" | "recent-same-space-memory";
} {
  return {
    id: memory.id,
    entityType: memory.entityType,
    conversationId: memory.conversationId,
    spaceId: memory.spaceId,
    visibility: memory.visibility,
    score: memory.score,
    updated: memory.updated,
    eligibilityReason: matchedQuery
      ? "same-space-query-match"
      : "recent-same-space-memory",
  };
}

function toAgentContextItem(
  memory: RetrievedConversationMemory,
): AgentContextItem {
  const channelLabel = memory.channelName ?? memory.channelId;
  return {
    id: memory.id,
    source: "conversation-memory",
    title: `${memory.entityType} from ${channelLabel}`,
    content: memory.content,
    provenance: {
      entityType: memory.entityType,
      entityId: memory.id,
      conversationId: memory.conversationId,
      spaceId: memory.spaceId,
      interfaceType: memory.interfaceType,
      channelId: memory.channelId,
      channelName: memory.channelName,
      updated: memory.updated,
      score: memory.score,
      messageCount: memory.messageCount,
      entryCount: memory.entryCount,
      status: memory.status,
    },
  };
}
