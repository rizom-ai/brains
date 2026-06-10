import type { ChatContext } from "./agent-types";
import type { BrainCallOptions } from "./brain-agent";

/**
 * Heuristics that shape per-call tool availability from the user's message.
 * Pure functions over the raw (pre-continuity) message text.
 */

function getSourceArtifactRequestInfo(message: string): {
  referencesArtifact: boolean;
  referencesExistingSource: boolean;
  durableArtifactRequest: boolean;
  deckCarouselPreviewOnly: boolean;
} {
  const normalized = message.toLowerCase();
  const referencesArtifact =
    /\b(carousel|printable|og image|open graph|social preview|preview image|attachment|attach|pdf|document)\b/.test(
      normalized,
    );
  const referencesExistingSource =
    /\b(deck|post|project|product|existing entity|source attachment|source-derived)\b/.test(
      normalized,
    );
  const durableArtifactRequest =
    /\b(save|persist|create|attach|regenerate|replace|set)\b/.test(normalized);
  const deckCarouselPreviewOnly =
    /\b(deck|slides|presentation)\b/.test(normalized) &&
    /\bcarousel\b/.test(normalized) &&
    /\b(preview|render)\b/.test(normalized) &&
    !durableArtifactRequest;

  return {
    referencesArtifact,
    referencesExistingSource,
    durableArtifactRequest,
    deckCarouselPreviewOnly,
  };
}

export function shouldEnableCreateSourceAttachment(input: {
  message: string;
  hasAccessibleUploads: boolean;
}): boolean {
  const info = getSourceArtifactRequestInfo(input.message);

  if (info.deckCarouselPreviewOnly) return false;
  if (input.hasAccessibleUploads && !info.referencesExistingSource) {
    return false;
  }
  return info.referencesArtifact;
}

export function shouldDisableDocumentGenerate(message: string): boolean {
  const info = getSourceArtifactRequestInfo(message);
  return (
    info.referencesArtifact &&
    info.referencesExistingSource &&
    info.durableArtifactRequest &&
    !info.deckCarouselPreviewOnly
  );
}

/**
 * Assemble the per-call agent options: routing identifiers plus the
 * message-derived tool-availability flags.
 */
export function buildBrainCallOptions(params: {
  message: string;
  hasAccessibleUploads: boolean;
  userPermissionLevel: NonNullable<ChatContext["userPermissionLevel"]>;
  conversationId: string;
  channelId: string | undefined;
  channelName: string;
  interfaceType: string;
  agentContextInstructions?: string;
}): BrainCallOptions {
  const enableCreateSourceAttachment = shouldEnableCreateSourceAttachment({
    message: params.message,
    hasAccessibleUploads: params.hasAccessibleUploads,
  });
  const disableDocumentGenerate = shouldDisableDocumentGenerate(params.message);

  return {
    userPermissionLevel: params.userPermissionLevel,
    conversationId: params.conversationId,
    ...(params.channelId ? { channelId: params.channelId } : {}),
    channelName: params.channelName,
    interfaceType: params.interfaceType,
    ...(params.hasAccessibleUploads
      ? { enableCreateUpload: true, enableCreateTransform: true }
      : {}),
    ...(enableCreateSourceAttachment
      ? { enableCreateSourceAttachment: true }
      : {}),
    ...(disableDocumentGenerate ? { disableDocumentGenerate: true } : {}),
    ...(params.agentContextInstructions
      ? { agentContextInstructions: params.agentContextInstructions }
      : {}),
  };
}
