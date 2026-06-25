import { z } from "@brains/utils/zod-v4";
import {
  AttachmentCardSchema,
  ToolApprovalCardSchema,
  type AttachmentCard,
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
const storedMessageMetadataRecordSchema = z.record(z.string(), z.unknown());

export type StoredMessageAttachment = z.infer<
  typeof storedMessageAttachmentSchema
>;

export function parseStoredMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      return parseMetadataRecord(JSON.parse(metadata));
    } catch {
      return null;
    }
  }
  return parseMetadataRecord(metadata);
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
  const parsedMetadata = parseStoredMessageMetadata(metadata);
  const cards = parsedMetadata?.["cards"];
  if (!Array.isArray(cards)) return [];

  const attachmentCards = cards.filter(
    (card) => parseMetadataRecord(card)?.["kind"] === "attachment",
  );
  const parsedCards = storedAttachmentCardsSchema.safeParse(attachmentCards);
  return parsedCards.success ? parsedCards.data : [];
}

export function collectUploadIdsFromStoredMessages(
  messages: readonly unknown[],
  options: { sourceKind: string; role?: string | undefined },
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const parsedMessage = parseMetadataRecord(message);
    if (!parsedMessage) continue;
    if (options.role && parsedMessage["role"] !== options.role) continue;
    for (const attachment of getStoredMessageAttachments(
      parsedMessage["metadata"],
    )) {
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
    const parsedMessage = parseMetadataRecord(message);
    if (!parsedMessage) continue;
    const parsedMetadata = parseStoredMessageMetadata(
      parsedMessage["metadata"],
    );
    const cards = parsedMetadata?.["cards"];
    if (!Array.isArray(cards)) continue;

    const approvalCandidates = cards.filter(
      (card) => parseMetadataRecord(card)?.["kind"] === "tool-approval",
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

function parseMetadataRecord(value: unknown): Record<string, unknown> | null {
  const parsed = storedMessageMetadataRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
