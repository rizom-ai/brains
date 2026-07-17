import type {
  ChatContext as RuntimeChatContext,
  IAgentService as RuntimeAgentService,
} from "@brains/ai-service";
import { parseAgentResponse } from "@brains/contracts";
import type {
  AgentNamespace,
  AgentResponse,
  ChatContext,
} from "../contracts/agent";

export function toPublicAgentResponse(response: unknown): AgentResponse {
  return parseAgentResponse(response);
}

function toRuntimeChatContext(
  context: ChatContext | undefined,
): RuntimeChatContext | undefined {
  if (!context) return undefined;

  return {
    ...(context.userPermissionLevel && {
      userPermissionLevel: context.userPermissionLevel,
    }),
    ...(context.interfaceType && { interfaceType: context.interfaceType }),
    ...(context.channelId && { channelId: context.channelId }),
    ...(context.channelName && { channelName: context.channelName }),
    ...(context.actor && { actor: context.actor }),
    ...(context.source && { source: context.source }),
    ...(context.attachments && { attachments: context.attachments }),
  };
}

export function createPublicAgentNamespace(
  agentService: RuntimeAgentService,
): AgentNamespace {
  return {
    chat: async (
      message,
      conversationId,
      context?: ChatContext,
      signal?: AbortSignal,
    ): Promise<AgentResponse> => {
      const runtimeContext = toRuntimeChatContext(context);
      const response = signal
        ? await agentService.chat(
            message,
            conversationId,
            runtimeContext,
            signal,
          )
        : await agentService.chat(message, conversationId, runtimeContext);
      return toPublicAgentResponse(response);
    },
    confirmPendingAction: async (
      conversationId,
      confirmed,
      approvalId,
      context,
      signal?: AbortSignal,
    ): Promise<AgentResponse> => {
      const runtimeContext = toRuntimeChatContext(context);
      if (!runtimeContext) {
        throw new Error("Confirmation requires caller context.");
      }
      const response = signal
        ? await agentService.confirmPendingAction(
            conversationId,
            confirmed,
            approvalId,
            runtimeContext,
            signal,
          )
        : await agentService.confirmPendingAction(
            conversationId,
            confirmed,
            approvalId,
            runtimeContext,
          );
      return toPublicAgentResponse(response);
    },
    invalidate: (): void => {
      agentService.invalidateAgent();
    },
  };
}
