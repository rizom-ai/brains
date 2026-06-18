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

export function shouldDisableSystemCreateForUploadRead(input: {
  message: string;
  hasAccessibleUploads: boolean;
}): boolean {
  if (!input.hasAccessibleUploads) return false;
  const normalized = input.message.toLowerCase();
  const asksToReadUpload =
    /\b(summari[sz]e|describe|inspect|look at|view|read|see|analy[sz]e|what(?:'s| is)? in|what does|can you look)\b/.test(
      normalized,
    ) &&
    /\b(upload(?:ed)?|file|pdf|image|attachment|it|this)\b/.test(normalized);
  const asksToPersist =
    /\b(save|persist|create|capture|store|import|promote|attach|turn\s+(?:it|this|the uploaded file|the uploaded pdf|the pdf|the file)\s+into|make\s+(?:it|this)\s+(?:a|an))\b/.test(
      normalized,
    );
  return asksToReadUpload && !asksToPersist;
}

export function shouldDisableSystemCreateForSavedAgentContact(
  message: string,
): boolean {
  const normalized = message.toLowerCase();
  const asksToContactAgent =
    /\b(ask|message|contact|talk to|call|reach out to|hear what)\b/.test(
      normalized,
    ) && /\b[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\b/.test(normalized);
  const asksToPersist =
    /\b(add|save|create|capture|store|remember|note|record)\b/.test(normalized);
  return asksToContactAgent && !asksToPersist;
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
  const disableSystemCreate =
    shouldDisableSystemCreateForUploadRead({
      message: params.message,
      hasAccessibleUploads: params.hasAccessibleUploads,
    }) || shouldDisableSystemCreateForSavedAgentContact(params.message);

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
          enableUploadSave: true,
        }
      : {}),
    ...(enableCreateSourceAttachment
      ? { enableCreateSourceAttachment: true }
      : {}),
    ...(disableDocumentGenerate ? { disableDocumentGenerate: true } : {}),
    ...(disableSystemCreate ? { disableSystemCreate: true } : {}),
    ...(params.agentContextInstructions
      ? { agentContextInstructions: params.agentContextInstructions }
      : {}),
  };
}
