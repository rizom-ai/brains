import { describe, expect, it } from "bun:test";
import { emailPlugin } from "./helpers/install";
import {
  EMAIL_SOURCE_READ,
  emailSourceReadResponseSchema,
  type EmailSourceReadResponse,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createInboundEmailSourceRef,
  type EmailImapConfig,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
} from "../src";
import { emailSourceLocatorSchema } from "../src/source-locator-store";
import { readEmailSource } from "../src/source-reader";

const recordedAt = new Date().toISOString();

const imapConfig: EmailImapConfig = {
  host: "imap.example.com",
  port: 993,
  user: "inbox-user",
  password: "inbox-password",
  mailbox: "INBOX",
  pollMode: "idle",
  pollIntervalMs: 60_000,
};

async function sourceMessage(): Promise<InboundEmailSourceMessage> {
  return {
    uid: 7,
    source: new Uint8Array(
      await Bun.file(
        new URL("fixtures/plain.eml", import.meta.url),
      ).arrayBuffer(),
    ),
    receivedAt: new Date("2026-04-15T09:00:00.000Z"),
  };
}

function sourceClient(options: {
  message: InboundEmailSourceMessage;
  uidValidity?: string;
  onFetch?: ((signal: AbortSignal, maxBytes: number) => void) | undefined;
}): InboundEmailClient {
  return {
    connect: async (): Promise<void> => undefined,
    selectMailbox: async (): Promise<string> => options.uidValidity ?? "42",
    fetchMessages: async function* (): AsyncGenerator<
      InboundEmailSourceMessage,
      void,
      unknown
    > {},
    fetchMessage: async (
      _uid,
      _maxBytes,
      signal,
    ): Promise<InboundEmailSourceMessage> => {
      options.onFetch?.(signal, _maxBytes);
      return options.message;
    },
    waitForChanges: async (): Promise<void> => undefined,
    disconnect: async (): Promise<void> => undefined,
  };
}

async function sendRead(
  harness: ReturnType<typeof createPluginHarness>,
  sourceRef: string,
  permissionLevel: "admin" | "trusted" | "public",
  signal?: AbortSignal,
): Promise<EmailSourceReadResponse> {
  const response = await harness
    .getServiceContext("source-read-test")
    .messaging.send({
      type: EMAIL_SOURCE_READ,
      payload: {
        sourceRef,
        actor: { permissionLevel },
        ...(signal ? { signal } : {}),
      },
    });
  if ("noop" in response || !response.success) {
    throw new Error("Email source read was not handled");
  }
  return emailSourceReadResponseSchema.parse(response.data);
}

describe("email source read", () => {
  it("resolves a private locator for an Admin with bounded plain content", async () => {
    const message = await sourceMessage();
    let observedSignal: AbortSignal | undefined;
    let observedMaxBytes: number | undefined;
    const harness = createPluginHarness();
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient =>
            sourceClient({
              message,
              onFetch: (signal, maxBytes) => {
                observedSignal = signal;
                observedMaxBytes = maxBytes;
              },
            }),
        },
      ),
    );
    const sourceRef = createInboundEmailSourceRef(
      { mailbox: "INBOX", uidValidity: "42" },
      7,
    );
    await harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.source-locators",
        schema: emailSourceLocatorSchema,
      })
      .set(sourceRef, {
        sourceRef,
        mailbox: "INBOX",
        uidValidity: "42",
        uid: 7,
        recordedAt,
      });

    const result = await sendRead(harness, sourceRef, "admin");

    expect(result).toMatchObject({
      kind: "available",
      message: {
        messageId: "<plain-1@example.com>",
        from: { name: "Alice Example", address: "alice@example.com" },
        to: [{ name: "Work Inbox", address: "work@example.com" }],
        subject: "Plain inquiry",
        text: expect.stringContaining("Hello from the plain text fixture."),
        references: [],
        truncated: false,
      },
    });
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedMaxBytes).toBe(1024 * 1024);
  });

  it("rejects oversized source bytes and truncates extracted plain text", async () => {
    const sourceRef = createInboundEmailSourceRef(
      { mailbox: "INBOX", uidValidity: "42" },
      7,
    );
    const locator = {
      sourceRef,
      mailbox: "INBOX",
      uidValidity: "42",
      uid: 7,
      recordedAt,
    };
    const oversized = await readEmailSource(
      imapConfig,
      (): InboundEmailClient =>
        sourceClient({
          message: {
            uid: 7,
            source: new Uint8Array(1024 * 1024 + 1),
            receivedAt: new Date("2026-04-15T09:00:00.000Z"),
          },
        }),
      locator,
      AbortSignal.timeout(1_000),
    );
    expect(oversized).toEqual({ kind: "unavailable" });

    const body = "a".repeat(100_100);
    const bounded = await readEmailSource(
      imapConfig,
      (): InboundEmailClient =>
        sourceClient({
          message: {
            uid: 7,
            source: Buffer.from(
              `From: Alice <alice@example.com>\r\nTo: Work <work@example.com>\r\nMessage-ID: <bounded@example.com>\r\nSubject: Bounded\r\n\r\n${body}`,
            ),
            receivedAt: new Date("2026-04-15T09:00:00.000Z"),
          },
        }),
      locator,
      AbortSignal.timeout(1_000),
    );
    expect(bounded.kind).toBe("available");
    if (bounded.kind !== "available") {
      throw new Error("Expected bounded source read");
    }
    expect(bounded.message.text).toHaveLength(100_000);
    expect(bounded.message.truncated).toBe(true);
  });

  it("propagates request cancellation into the bounded IMAP read", async () => {
    const message = await sourceMessage();
    let beginFetch = (): void => {};
    const fetchStarted = new Promise<void>((resolve) => {
      beginFetch = resolve;
    });
    let disconnected = false;
    const harness = createPluginHarness();
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient => ({
            ...sourceClient({ message }),
            fetchMessage: async (_uid, _maxBytes, signal): Promise<never> => {
              beginFetch();
              return new Promise<never>((_resolve, reject) => {
                const abort = (): void => reject(signal.reason);
                if (signal.aborted) abort();
                else signal.addEventListener("abort", abort, { once: true });
              });
            },
            disconnect: async (): Promise<void> => {
              disconnected = true;
            },
          }),
        },
      ),
    );
    const sourceRef = createInboundEmailSourceRef(
      { mailbox: "INBOX", uidValidity: "42" },
      7,
    );
    await harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.source-locators",
        schema: emailSourceLocatorSchema,
      })
      .set(sourceRef, {
        sourceRef,
        mailbox: "INBOX",
        uidValidity: "42",
        uid: 7,
        recordedAt,
      });
    const controller = new AbortController();

    const pending = sendRead(harness, sourceRef, "admin", controller.signal);
    await fetchStarted;
    controller.abort(new Error("closed detail"));

    expect(await pending).toEqual({ kind: "unavailable" });
    expect(disconnected).toBe(true);
  });

  it("fails closed for non-Admins, unknown locators, and mailbox generations", async () => {
    const message = await sourceMessage();
    let clientCreations = 0;
    const harness = createPluginHarness();
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient => {
            clientCreations += 1;
            return sourceClient({ message, uidValidity: "43" });
          },
        },
      ),
    );
    const sourceRef = createInboundEmailSourceRef(
      { mailbox: "INBOX", uidValidity: "42" },
      7,
    );
    await harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.source-locators",
        schema: emailSourceLocatorSchema,
      })
      .set(sourceRef, {
        sourceRef,
        mailbox: "INBOX",
        uidValidity: "42",
        uid: 7,
        recordedAt,
      });

    expect(await sendRead(harness, sourceRef, "trusted")).toEqual({
      kind: "unavailable",
    });
    expect(clientCreations).toBe(0);
    expect(
      await sendRead(
        harness,
        createInboundEmailSourceRef({ mailbox: "INBOX", uidValidity: "42" }, 8),
        "admin",
      ),
    ).toEqual({ kind: "unavailable" });
    expect(clientCreations).toBe(0);
    expect(await sendRead(harness, sourceRef, "admin")).toEqual({
      kind: "unavailable",
    });
    expect(clientCreations).toBe(1);
  });
});
