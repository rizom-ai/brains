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
  StructuredChatCard,
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
    ...(response.cards && {
      cards: response.cards.map(
        (card): StructuredChatCard => ({
          kind: card.kind,
          id: card.id,
          ...(card.toolCallId !== undefined && { toolCallId: card.toolCallId }),
          toolName: card.toolName,
          ...(card.input !== undefined && { input: card.input }),
          description: card.description,
          state: card.state,
          ...(card.output !== undefined && { output: card.output }),
          ...(card.error !== undefined && { error: card.error }),
        }),
      ),
    }),
    ...(response.pendingConfirmation && {
      pendingConfirmation: toPublicPendingConfirmation(
        response.pendingConfirmation,
      ),
    }),
    ...(response.pendingConfirmations && {
      pendingConfirmations: response.pendingConfirmations.map((confirmation) =>
        toPublicPendingConfirmation(confirmation),
      ),
    }),
    usage: response.usage,
  };
}

function toPublicPendingConfirmation(
  confirmation: NonNullable<RuntimeAgentResponse["pendingConfirmation"]>,
): PendingConfirmation {
  return {
    id: confirmation.id,
    ...(confirmation.toolCallId !== undefined && {
      toolCallId: confirmation.toolCallId,
    }),
    toolName: confirmation.toolName,
    description: confirmation.description,
    args: confirmation.args,
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
    ...(context.actor && { actor: context.actor }),
    ...(context.source && { source: context.source }),
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
