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
  const [matched, recent] = await Promise.all([
    retriever.retrieve({
      query: request.message,
      conversationId: request.conversationId,
      interfaceType: request.interfaceType,
      channelId: request.channelId,
      limit: DEFAULT_AGENT_CONTEXT_LIMIT,
      visibilityScope,
    }),
    retriever.retrieve({
      conversationId: request.conversationId,
      interfaceType: request.interfaceType,
      channelId: request.channelId,
      limit: RECENT_AGENT_CONTEXT_LIMIT,
      visibilityScope,
    }),
  ]);
  const merged = mergeMemoryResults(matched.results, recent.results);

  logAgentContextAudit(context, request, {
    visibilityScope,
    spaceId: matched.spaceId ?? recent.spaceId,
    reason: merged.length > 0 ? "memory-injected" : "no-same-space-memory",
    items: merged.map((memory) =>
      toAuditItem(
        memory,
        matched.results.some((item) => item.id === memory.id),
      ),
    ),
  });

  return {
    items: merged.map(toAgentContextItem),
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

function mergeMemoryResults(
  matched: RetrievedConversationMemory[],
  recent: RetrievedConversationMemory[],
): RetrievedConversationMemory[] {
  const seen = new Set<string>();
  const merged: RetrievedConversationMemory[] = [];

  for (const memory of [...matched, ...recent]) {
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    merged.push(memory);
  }

  return merged;
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
