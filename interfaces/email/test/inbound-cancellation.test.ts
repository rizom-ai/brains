import { expect, test, mock } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  intakeInboundEmail,
  connectImapWithIpv4TlsFallback,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
} from "../src/inbound-email";

test.each(["before", "failure", "success", "ipv4"])(
  "connection cancellation at %s does not escape into another stage",
  async (phase) => {
    const abort = new AbortController();
    const reason = new Error("Connection stopped");
    const certificate = Object.assign(new Error("Certificate failed"), {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    const connect = mock(async (family: 4 | undefined) => {
      if (phase === "ipv4" && family === undefined) throw certificate;
      abort.abort(reason);
      if (phase === "failure") throw certificate;
      return "connected";
    });
    if (phase === "before") abort.abort(reason);
    await connectImapWithIpv4TlsFallback(
      "imap.example",
      connect,
      abort.signal,
    ).then(unexpected, (error: unknown): void => {
      expect(error).toBe(reason);
    });
    expect(connect).toHaveBeenCalledTimes(
      phase === "before" ? 0 : phase === "ipv4" ? 2 : 1,
    );
  },
);

async function unexpected(): Promise<never> {
  throw new Error("Unexpected operation");
}

test.each(["sender", "publish"])(
  "cancellation during %s gates later stages without retracting acknowledgements",
  async (phase) => {
    const abort = new AbortController();
    const reason = new Error("Intake stopped");
    const cursor = createMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.cancellation",
        schema: z.strictObject({
          mailbox: z.string(),
          uidValidity: z.string(),
          lastUid: z.number().int().nonnegative(),
        }),
      });
    const selection = { mailbox: "INBOX", uidValidity: "1" };
    let nextMessage = false;
    let closed = false;
    const source: InboundEmailSourceMessage = {
      uid: 7,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      source: new TextEncoder().encode(
        "From: sender@example.com\r\nTo: inbox@example.com\r\nSubject: Fixture\r\nMessage-ID: <fixture@example.com>\r\n\r\nBody",
      ),
    };
    const client: InboundEmailClient = {
      connect: unexpected,
      selectMailbox: unexpected,
      waitForChanges: unexpected,
      disconnect: unexpected,
      fetchMessages:
        async function* (): AsyncGenerator<InboundEmailSourceMessage> {
          try {
            yield source;
            nextMessage = true;
            yield { ...source, uid: 8 };
          } finally {
            closed = true;
          }
        },
    };
    const publish = mock(async () => {
      abort.abort(reason);
      return { success: true };
    });
    const pruneSourceLocators = mock(async (): Promise<void> => undefined);
    const pending = intakeInboundEmail(client, selection, {
      signal: abort.signal,
      cursor,
      publish,
      logger: createMockLogger(),
      pruneSourceLocators,
      resolveSender: async (): Promise<undefined> => {
        if (phase === "sender") abort.abort(reason);
        return undefined;
      },
    });
    await pending.then(unexpected, (error: unknown): void => {
      expect(error).toBe(reason);
    });
    expect(publish).toHaveBeenCalledTimes(phase === "sender" ? 0 : 1);
    expect(await cursor.get("cursor")).toEqual({
      ...selection,
      lastUid: phase === "sender" ? 0 : 7,
    });
    expect(nextMessage).toBe(false);
    expect(closed).toBe(true);
    expect(pruneSourceLocators).not.toHaveBeenCalled();
  },
);
