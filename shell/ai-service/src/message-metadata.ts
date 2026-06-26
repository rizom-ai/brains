import type {
  ConversationMessageActor,
  ConversationMessageMetadata,
  ConversationMessageSource,
} from "@brains/conversation-service";
import type {
  CanonicalIdentityResolver,
  ChatAttachment,
  StructuredChatCard,
} from "./agent-types";
import type { AgentContactCandidate, EntityMemoryRef } from "./agent-results";

/**
 * The metadata shape the agent writes onto conversation messages.
 * Narrows the storage layer's passthrough `ConversationMessageMetadata`
 * with the keys this module actually produces.
 */
export interface AgentMessageMetadata extends ConversationMessageMetadata {
  attachments?: Record<string, unknown>[];
  cards?: StructuredChatCard[];
  entityMemoryRefs?: EntityMemoryRef[];
  agentContactCandidates?: AgentContactCandidate[];
  /** Legacy metadata key from older builds. Do not write new values. */
  entityMemoryNote?: string;
}

function toMessageAttachmentMetadata(
  attachment: ChatAttachment,
): Record<string, unknown> {
  return {
    kind: attachment.kind,
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    ...(attachment.sizeBytes !== undefined && {
      sizeBytes: attachment.sizeBytes,
    }),
    ...(attachment.source !== undefined && { source: attachment.source }),
  };
}

/**
 * Build conversation-message metadata, enriching the actor through the
 * canonical identity resolver when one is configured. Empty inputs produce
 * empty metadata so callers can skip persisting a metadata field entirely.
 */
export function buildMessageMetadata(params: {
  actor: ConversationMessageActor | null;
  source: ConversationMessageSource | null;
  attachments?: ChatAttachment[];
  cards?: StructuredChatCard[];
  entityMemoryRefs?: EntityMemoryRef[];
  agentContactCandidates?: AgentContactCandidate[];
  canonicalIdentityResolver?: CanonicalIdentityResolver;
}): AgentMessageMetadata {
  const {
    actor,
    source,
    attachments = [],
    cards = [],
    entityMemoryRefs = [],
    agentContactCandidates = [],
    canonicalIdentityResolver,
  } = params;
  const enrichedActor = actor
    ? (canonicalIdentityResolver?.enrichActor(actor) ?? actor)
    : null;
  return {
    ...(enrichedActor ? { actor: enrichedActor } : {}),
    ...(source ? { source } : {}),
    ...(attachments.length > 0
      ? {
          attachments: attachments.map((attachment) =>
            toMessageAttachmentMetadata(attachment),
          ),
        }
      : {}),
    ...(cards.length > 0 ? { cards } : {}),
    ...(entityMemoryRefs.length > 0 ? { entityMemoryRefs } : {}),
    ...(agentContactCandidates.length > 0 ? { agentContactCandidates } : {}),
  };
}

export function withMessageMetadata(
  metadata: ConversationMessageMetadata,
): { metadata: Record<string, unknown> } | Record<string, never> {
  return Object.keys(metadata).length > 0 ? { metadata } : {};
}
