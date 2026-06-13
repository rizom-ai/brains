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
    ): Promise<AgentResponse> => {
      return toPublicAgentResponse(
        await agentService.chat(
          message,
          conversationId,
          toRuntimeChatContext(context),
        ),
      );
    },
    confirmPendingAction: async (
      conversationId,
      confirmed,
      approvalId,
    ): Promise<AgentResponse> => {
      return toPublicAgentResponse(
        await agentService.confirmPendingAction(
          conversationId,
          confirmed,
          approvalId,
        ),
      );
    },
    invalidate: (): void => {
      agentService.invalidateAgent();
    },
  };
}
