import type {
  AgentResponse as RuntimeAgentResponse,
  ChatContext as RuntimeChatContext,
  IAgentService as RuntimeAgentService,
} from "@brains/ai-service";
import type {
  AgentNamespace,
  AgentResponse,
  ChatContext,
  PendingConfirmation,
  ToolResultData,
} from "../contracts/agent";

export function toPublicAgentResponse(
  response: RuntimeAgentResponse,
): AgentResponse {
  return {
    text: response.text,
    ...(response.toolResults && {
      toolResults: response.toolResults.map(
        (result): ToolResultData => ({
          toolName: result.toolName,
          ...(result.args && { args: result.args }),
          ...(result.jobId !== undefined && { jobId: result.jobId }),
          ...(result.data !== undefined && { data: result.data }),
        }),
      ),
    }),
    ...(response.pendingConfirmation && {
      pendingConfirmation: {
        toolName: response.pendingConfirmation.toolName,
        description: response.pendingConfirmation.description,
        args: response.pendingConfirmation.args,
      } satisfies PendingConfirmation,
    }),
    usage: response.usage,
  };
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
    ): Promise<AgentResponse> => {
      return toPublicAgentResponse(
        await agentService.confirmPendingAction(conversationId, confirmed),
      );
    },
    invalidate: (): void => {
      agentService.invalidateAgent();
    },
  };
}
