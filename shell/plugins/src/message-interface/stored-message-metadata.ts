import { z } from "@brains/utils";
import {
  AttachmentCardSchema,
  StructuredChatCardSchema,
  ToolApprovalCardSchema,
  type AttachmentCard,
  type StructuredChatCard,
} from "../contracts/agent";

const storedAttachmentSourceSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

const storedMessageAttachmentSchema = z.object({
  kind: z.string().min(1),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  source: storedAttachmentSourceSchema.optional(),
});

const storedMessageAttachmentsSchema = z.array(storedMessageAttachmentSchema);
const storedAttachmentCardsSchema = z.array(AttachmentCardSchema);
const storedToolApprovalCardsSchema = z.array(ToolApprovalCardSchema);

export type StoredMessageAttachment = z.infer<
  typeof storedMessageAttachmentSchema
>;

export function parseStoredMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(metadata) ? metadata : null;
}

export function getStoredMessageAttachments(
  metadata: unknown,
): StoredMessageAttachment[] {
  const parsedMetadata = parseStoredMessageMetadata(metadata);
  const parsedAttachments = storedMessageAttachmentsSchema.safeParse(
    parsedMetadata?.["attachments"],
  );
  return parsedAttachments.success ? parsedAttachments.data : [];
}

export function getStoredAttachmentCards(metadata: unknown): AttachmentCard[] {
  const attachmentCards = getStoredMessageCards(metadata).filter(
    (card): card is AttachmentCard => card.kind === "attachment",
  );
  const parsedCards = storedAttachmentCardsSchema.safeParse(attachmentCards);
  return parsedCards.success ? parsedCards.data : [];
}

export function getStoredMessageCards(metadata: unknown): StructuredChatCard[] {
  const parsedMetadata = parseStoredMessageMetadata(metadata);
  const cards = parsedMetadata?.["cards"];
  if (!Array.isArray(cards)) return [];

  return cards
    .map((card) => StructuredChatCardSchema.safeParse(card))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function collectUploadIdsFromStoredMessages(
  messages: readonly unknown[],
  options: { sourceKind: string; role?: string | undefined },
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (!isRecord(message)) continue;
    if (options.role && message["role"] !== options.role) continue;
    for (const attachment of getStoredMessageAttachments(message["metadata"])) {
      if (attachment.source?.kind !== options.sourceKind) continue;
      if (seen.has(attachment.source.id)) continue;
      seen.add(attachment.source.id);
      ids.push(attachment.source.id);
    }
  }
  return ids;
}

export function collectPendingApprovalIdsFromStoredMessages(
  messages: readonly unknown[],
): Set<string> {
  const pending = new Set<string>();
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const parsedMetadata = parseStoredMessageMetadata(message["metadata"]);
    const cards = parsedMetadata?.["cards"];
    if (!Array.isArray(cards)) continue;

    const approvalCandidates = cards.filter(
      (card): card is unknown =>
        isRecord(card) && card["kind"] === "tool-approval",
    );
    const parsedCards =
      storedToolApprovalCardsSchema.safeParse(approvalCandidates);
    if (!parsedCards.success) continue;

    for (const card of parsedCards.data) {
      if (card.state === "approval-requested") {
        pending.add(card.id);
      } else {
        pending.delete(card.id);
      }
    }
  }
  return pending;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
