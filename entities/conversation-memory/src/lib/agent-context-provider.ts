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
  if (!request.channelId) {
    return { items: [] };
  }

  const retriever = new ConversationMemoryRetriever(context);
  const result = await retriever.retrieve({
    query: request.message,
    conversationId: request.conversationId,
    interfaceType: request.interfaceType,
    channelId: request.channelId,
    limit: DEFAULT_AGENT_CONTEXT_LIMIT,
    visibilityScope: permissionToVisibilityScope(request.userPermissionLevel),
  });

  return {
    items: result.results.map(toAgentContextItem),
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
    content: memory.excerpt,
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
