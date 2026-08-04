import { describe, expect, it } from "bun:test";
import { EMAIL_INBOUND, inboundEmailSchema } from "../src";

const inbound = {
  messageId: "<message@example.com>",
  sourceRef: "imap:opaque-source",
  from: { address: "sender@example.com" },
  to: [{ address: "recipient@example.net" }],
  subject: "Private subject",
  receivedAt: "2026-04-15T09:00:00.000Z",
  text: "Private body",
  headers: { autoSubmitted: "no" },
};

describe("inbound email contract", () => {
  it("requires an opaque transport-owned source reference", () => {
    expect(EMAIL_INBOUND).toBe("email:inbound");
    expect(inboundEmailSchema.parse(inbound)).toEqual(inbound);
    const { sourceRef: _sourceRef, ...withoutSourceRef } = inbound;
    expect(inboundEmailSchema.safeParse(withoutSourceRef).success).toBe(false);
  });

  it("rejects malformed and unknown fields", () => {
    expect(
      inboundEmailSchema.safeParse({ ...inbound, sourceRef: "" }).success,
    ).toBe(false);
    expect(
      inboundEmailSchema.safeParse({ ...inbound, rawMailbox: "INBOX" }).success,
    ).toBe(false);
  });
});
