import type { ChatContext } from "./agent-types";
import type { BrainCallOptions } from "./brain-agent";

/**
 * Assemble per-call agent options from typed runtime context only.
 * Natural-language routing belongs in the model's typed tool arguments, not in
 * host-side message-text heuristics.
 */
export function buildBrainCallOptions(params: {
  hasAccessibleUploads: boolean;
  userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
  conversationId: string;
  channelId: string | undefined;
  channelName: string;
  interfaceType: string;
  agentContextInstructions?: string;
  hasPriorResponseCandidate?: boolean;
}): BrainCallOptions {
  return {
    userPermissionLevel: params.userPermissionLevel,
    conversationId: params.conversationId,
    ...(params.channelId ? { channelId: params.channelId } : {}),
    channelName: params.channelName,
    interfaceType: params.interfaceType,
    ...(params.hasAccessibleUploads
      ? {
          enableCreateUpload: true,
          enableCreateTransform: true,
        }
      : {}),
    ...(params.hasPriorResponseCandidate !== undefined
      ? { hasPriorResponseCandidate: params.hasPriorResponseCandidate }
      : {}),
    ...(params.agentContextInstructions
      ? { agentContextInstructions: params.agentContextInstructions }
      : {}),
  };
}
