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
  isAnchor?: boolean;
  conversationId: string;
  channelId: string | undefined;
  channelName: string;
  interfaceType: string;
  actor?: ChatContext["actor"];
  agentContextInstructions?: string;
  hasPriorResponseCandidate?: boolean;
}): BrainCallOptions {
  return {
    userPermissionLevel: params.userPermissionLevel,
    ...(params.isAnchor !== undefined ? { isAnchor: params.isAnchor } : {}),
    conversationId: params.conversationId,
    ...(params.channelId ? { channelId: params.channelId } : {}),
    channelName: params.channelName,
    interfaceType: params.interfaceType,
    ...(params.actor
      ? {
          actor: params.actor.identity,
          ...(params.actor.displayName
            ? { displayName: params.actor.displayName }
            : {}),
        }
      : {}),
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
