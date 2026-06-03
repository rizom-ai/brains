import {
  AGENT_CONTEXT_REQUEST_CHANNEL,
  agentContextRequestSchema,
  type AgentContextItem,
  type AgentContextRequest,
  type AgentContextResponse,
} from "@brains/contracts";
import {
  permissionToVisibilityScope,
  type EntityPluginContext,
} from "@brains/plugins";
import { ConversationMemoryRetriever } from "./conversation-memory-retriever";
import type { RetrievedConversationMemory } from "./conversation-memory-retriever";

const DEFAULT_AGENT_CONTEXT_LIMIT = 5;
const RECENT_AGENT_CONTEXT_LIMIT = 3;

export function registerConversationMemoryAgentContext(
  context: EntityPluginContext,
): void {
  context.messaging.subscribe(
    AGENT_CONTEXT_REQUEST_CHANNEL,
    async (message) => {
      const request = agentContextRequestSchema.parse(message.payload);
      const data = await buildConversationMemoryAgentContext(context, request);
      return { success: true, data };
    },
  );
}

export async function buildConversationMemoryAgentContext(
  context: EntityPluginContext,
  request: AgentContextRequest,
): Promise<AgentContextResponse> {
  const visibilityScope = permissionToVisibilityScope(
    request.userPermissionLevel,
  );

  if (!request.channelId) {
    logAgentContextAudit(context, request, {
      visibilityScope,
      reason: "no-channel-context",
      items: [],
    });
    return { items: [] };
  }

  const retriever = new ConversationMemoryRetriever(context);
  const matched = await retriever.retrieve({
    query: request.message,
    conversationId: request.conversationId,
    interfaceType: request.interfaceType,
    channelId: request.channelId,
    limit: DEFAULT_AGENT_CONTEXT_LIMIT,
    visibilityScope,
  });

  // Fall back to recent same-space memory only when the query matched nothing,
  // so a relevant turn still gets grounding without doubling retrieval work or
  // injecting unrelated recent memory alongside good matches on every turn.
  const recent =
    matched.results.length === 0
      ? await retriever.retrieve({
          conversationId: request.conversationId,
          interfaceType: request.interfaceType,
          channelId: request.channelId,
          limit: RECENT_AGENT_CONTEXT_LIMIT,
          visibilityScope,
        })
      : undefined;

  const fromQueryMatch = matched.results.length > 0;
  const results = fromQueryMatch ? matched.results : (recent?.results ?? []);

  logAgentContextAudit(context, request, {
    visibilityScope,
    spaceId: matched.spaceId ?? recent?.spaceId,
    reason: results.length > 0 ? "memory-injected" : "no-same-space-memory",
    items: results.map((memory) => toAuditItem(memory, fromQueryMatch)),
  });

  return {
    items: results.map(toAgentContextItem),
  };
}

function logAgentContextAudit(
  context: EntityPluginContext,
  request: AgentContextRequest,
  audit: {
    visibilityScope: ReturnType<typeof permissionToVisibilityScope>;
    spaceId?: string | undefined;
    reason: "memory-injected" | "no-channel-context" | "no-same-space-memory";
    items: ReturnType<typeof toAuditItem>[];
  },
): void {
  context.logger.info("Conversation memory agent context audit", {
    conversationId: request.conversationId,
    interfaceType: request.interfaceType,
    channelId: request.channelId,
    channelName: request.channelName,
    userPermissionLevel: request.userPermissionLevel,
    visibilityScope: audit.visibilityScope,
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
