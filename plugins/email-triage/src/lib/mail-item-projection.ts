import { inboundEmailSchema, type InboundEmail } from "@brains/contracts";
import { sha256Hex } from "@brains/utils/hash";
import { mailItemAdapter } from "../entity/adapters/mail-item-adapter";
import type { MailItemMetadata } from "../entity/schemas/mail-item";
import {
  retainedMailClassificationSchema,
  type RetainedMailClassification,
} from "../schemas/triage";

export interface MailItemProjection {
  id: string;
  entityType: "mail-item";
  content: string;
  metadata: MailItemMetadata;
  visibility: "restricted";
}

export function mailItemIdForMessage(messageId: string): string {
  return `mail-${sha256Hex(messageId)}`;
}

export function createMailItemProjection(
  input: InboundEmail,
  rawClassification: RetainedMailClassification,
): MailItemProjection {
  const email = inboundEmailSchema.parse(input);
  const classification =
    retainedMailClassificationSchema.parse(rawClassification);
  return buildProjection(
    email,
    {
      title: classification.title,
      category: classification.category,
      priority: classification.priority,
      status: "new",
      needsReply: classification.needsReply,
      receivedAt: email.receivedAt,
      source: {
        ref: email.sourceRef,
        senderKey: sha256Hex(email.from.address.toLowerCase()),
        ...(email.threadId ? { threadKey: sha256Hex(email.threadId) } : {}),
        ...(email.sender?.personId ? { personId: email.sender.personId } : {}),
        ...domainFromAddress(email.from.address),
      },
      ...(classification.organization
        ? { organization: classification.organization }
        : {}),
      requestedActions: classification.requestedActions,
    },
    classification.summary,
  );
}

export function createUnclassifiedMailItemProjection(
  input: InboundEmail,
): MailItemProjection {
  const email = inboundEmailSchema.parse(input);
  return buildProjection(
    email,
    {
      title: "Unclassified email",
      category: null,
      priority: "high",
      status: "new",
      needsReply: true,
      receivedAt: email.receivedAt,
      source: {
        ref: email.sourceRef,
        senderKey: sha256Hex(email.from.address.toLowerCase()),
        ...(email.threadId ? { threadKey: sha256Hex(email.threadId) } : {}),
        ...(email.sender?.personId ? { personId: email.sender.personId } : {}),
        ...domainFromAddress(email.from.address),
      },
      requestedActions: ["Review the original message in the mailbox"],
    },
    "Review the original message in the mailbox.",
  );
}

function buildProjection(
  email: InboundEmail,
  frontmatter: Parameters<typeof mailItemAdapter.createMailItemContent>[0],
  summary: string,
): MailItemProjection {
  const content = mailItemAdapter.createMailItemContent(frontmatter, summary);
  const parsed = mailItemAdapter.fromMarkdown(content);
  if (!parsed.metadata) {
    throw new Error("Mail item metadata could not be derived");
  }
  return {
    id: mailItemIdForMessage(email.messageId),
    entityType: "mail-item",
    content,
    metadata: parsed.metadata,
    visibility: "restricted",
  };
}

function domainFromAddress(address: string): { domain?: string } {
  const separator = address.lastIndexOf("@");
  const domain =
    separator >= 0 ? address.slice(separator + 1).toLowerCase() : "";
  return domain ? { domain } : {};
}
