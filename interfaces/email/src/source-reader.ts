import {
  emailSourceReadResponseSchema,
  type EmailSourceReadResponse,
} from "@brains/contracts";
import type { EmailImapConfig, InboundEmailClient } from "./inbound-email";
import { parseInboundEmail } from "./inbound-email";
import type { EmailSourceLocator } from "./source-locator-store";

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 100_000;

export async function readEmailSource(
  config: EmailImapConfig,
  createClient: (config: EmailImapConfig) => InboundEmailClient,
  locator: EmailSourceLocator,
  signal: AbortSignal,
): Promise<EmailSourceReadResponse> {
  if (signal.aborted) return { kind: "unavailable" };
  const client = createClient(config);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const uidValidity = await client.selectMailbox(locator.mailbox);
    if (uidValidity !== locator.uidValidity || !client.fetchMessage) {
      return { kind: "unavailable" };
    }
    const source = await client.fetchMessage(
      locator.uid,
      MAX_SOURCE_BYTES,
      signal,
    );
    if (
      source?.uid !== locator.uid ||
      source.source.byteLength > MAX_SOURCE_BYTES
    ) {
      return { kind: "unavailable" };
    }
    const email = await parseInboundEmail(source, locator.sourceRef);
    const truncated =
      source.sourceTruncated === true || email.text.length > MAX_TEXT_LENGTH;
    return emailSourceReadResponseSchema.parse({
      kind: "available",
      message: {
        messageId: email.messageId,
        from: email.from,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        to: email.to,
        subject: email.subject,
        receivedAt: email.receivedAt,
        text: email.text.slice(0, MAX_TEXT_LENGTH),
        ...(email.headers.inReplyTo
          ? { inReplyTo: email.headers.inReplyTo }
          : {}),
        references: email.headers.references ?? [],
        truncated,
      },
    });
  } catch {
    return { kind: "unavailable" };
  } finally {
    if (connected) {
      try {
        await client.disconnect();
      } catch {
        // The fixed unavailable outcome is handled by the caller; cleanup
        // failures must not expose mailbox details.
      }
    }
  }
}
