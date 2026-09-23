import {
  parseRawInboundEmail,
  type RawEmailSource,
} from "../../src/mime-parser";
import type { InboundEmailSourceMessage } from "../../src/inbound-email";

/** Fixture generation only; production parsing is confined to the source actor. */
export async function parsedFixture(
  source: RawEmailSource,
): Promise<InboundEmailSourceMessage> {
  const result: InboundEmailSourceMessage = {
    uid: source.uid,
    sourceBytes: source.source.byteLength,
    ...(source.sourceTruncated ? { sourceTruncated: true } : {}),
  };
  try {
    result.email = await parseRawInboundEmail(source, `imap:${"0".repeat(64)}`);
  } catch {
    /* Mirror a known invalid-MIME actor result. */
  }
  return result;
}
