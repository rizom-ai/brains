import { simpleParser, type AddressObject, type HeaderLines } from "mailparser";
import {
  inboundEmailSchema,
  type InboundEmail,
  type InboundEmailAddress,
} from "@brains/contracts";
import { sha256Hex } from "@brains/utils/hash";

/** Actor-only raw MIME input. Never returned by the controller IMAP client. */
export interface RawEmailSource {
  uid: number;
  source: Uint8Array;
  receivedAt: Date;
  threadId?: string | undefined;
  sourceTruncated?: boolean | undefined;
}
export async function parseRawInboundEmail(
  sourceMessage: RawEmailSource,
  sourceRef: string,
): Promise<InboundEmail> {
  const parsed = await simpleParser(Buffer.from(sourceMessage.source), {
    skipImageLinks: true,
  });
  const from = addresses(parsed.from)[0];
  if (!from) throw new Error("Inbound email sender was missing");
  const messageId = messageIdOrSynthetic(
    parsed.messageId,
    sourceMessage.source,
  );
  const replyTo = addresses(parsed.replyTo)[0];
  const references = (
    typeof parsed.references === "string"
      ? [parsed.references]
      : (parsed.references ?? [])
  )
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0);
  const html = typeof parsed.html === "string" ? parsed.html : undefined;
  return inboundEmailSchema.parse({
    messageId,
    sourceRef,
    ...(sourceMessage.threadId ? { threadId: sourceMessage.threadId } : {}),
    from,
    ...(replyTo ? { replyTo } : {}),
    to: addresses(parsed.to),
    subject: parsed.subject ?? "",
    receivedAt: sourceMessage.receivedAt.toISOString(),
    text: parsed.text ?? "",
    ...(html ? { html } : {}),
    headers: {
      ...optionalHeader(
        parsed.headerLines,
        "list-unsubscribe",
        "listUnsubscribe",
      ),
      ...optionalHeader(parsed.headerLines, "auto-submitted", "autoSubmitted"),
      ...optionalHeader(parsed.headerLines, "precedence", "precedence"),
      ...(parsed.inReplyTo?.trim()
        ? { inReplyTo: parsed.inReplyTo.trim() }
        : {}),
      ...(references.length ? { references } : {}),
    },
  });
}
function messageIdOrSynthetic(
  declared: string | undefined,
  source: Uint8Array,
): string {
  const normalized = declared?.trim();
  if (normalized) return normalized;
  return `<synthetic-${sha256Hex(Buffer.from(source).toString("base64"))}@brains.local>`;
}

function addresses(
  value: AddressObject | AddressObject[] | undefined,
): InboundEmailAddress[] {
  const objects = value ? (Array.isArray(value) ? value : [value]) : [];
  return objects.flatMap((object) =>
    object.value.flatMap((entry) =>
      entry.group ? entry.group.flatMap(toAddress) : toAddress(entry),
    ),
  );
}
function toAddress(value: {
  address?: string | undefined;
  name: string;
}): InboundEmailAddress[] {
  const address = value.address?.trim().toLowerCase();
  if (!address) return [];
  const name = value.name.trim();
  return [{ address, ...(name ? { name } : {}) }];
}
function optionalHeader(
  lines: HeaderLines,
  headerName: string,
  key: "listUnsubscribe" | "autoSubmitted" | "precedence",
): Partial<InboundEmail["headers"]> {
  const line = lines.find((candidate) => candidate.key === headerName)?.line;
  const separator = line?.indexOf(":") ?? -1;
  const value = separator >= 0 ? line?.slice(separator + 1).trim() : undefined;
  return value ? { [key]: value } : {};
}
