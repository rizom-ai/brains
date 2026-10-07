import { describe, expect, it } from "bun:test";
import { emailPlugin, EMAIL_PLUGIN_ID } from "./helpers/install";
import { EventEmitter } from "node:events";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveRequestSchema,
  createExternalActorId,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";

import {
  EMAIL_INBOUND,
  createInboundEmailSourceRef,
  inboundEmailSchema,
  type EmailImapConfig,
  type InboundEmail,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
} from "../src";
import { z } from "@brains/utils/zod";
import {
  connectImapWithIpv4TlsFallback,
  intakeInboundEmail,
  parseInboundEmail,
  preventUnhandledImapErrors,
} from "../src/inbound-email";

const imapConfig: EmailImapConfig = {
  host: "imap.example.com",
  port: 993,
  user: "inbox-user",
  password: "inbox-password",
  mailbox: "INBOX",
  pollMode: "idle",
  pollIntervalMs: 60_000,
};

const mailboxReceivedAt = new Date("2026-04-15T09:00:00.000Z");

describe("IMAP transport safeguards", () => {
  it("keeps socket errors between interval polls from crashing the process", () => {
    const client = new EventEmitter();
    preventUnhandledImapErrors(client);

    expect(() =>
      client.emit(
        "error",
        Object.assign(new Error("Socket timeout"), {
          code: "ETIMEOUT",
        }),
      ),
    ).not.toThrow();
  });

  it("retries a hostname over IPv4 after Bun loses IPv6 certificate names", async () => {
    const families: Array<4 | undefined> = [];
    const result = await connectImapWithIpv4TlsFallback(
      "imap.example.com",
      async (family) => {
        families.push(family);
        if (family === undefined) {
          throw Object.assign(new Error("certificate names unavailable"), {
            code: "ERR_TLS_CERT_ALTNAME_INVALID",
          });
        }
        return "connected";
      },
    );

    expect(result).toBe("connected");
    expect(families).toEqual([undefined, 4]);
  });

  it("does not weaken hostname validation for other failures or IP hosts", async () => {
    const certificateError = Object.assign(new Error("certificate mismatch"), {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    const connectionError = Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED",
    });

    expect(
      connectImapWithIpv4TlsFallback("imap.example.com", async () => {
        throw connectionError;
      }),
    ).rejects.toBe(connectionError);
    expect(
      connectImapWithIpv4TlsFallback("192.0.2.1", async () => {
        throw certificateError;
      }),
    ).rejects.toBe(certificateError);
  });
});

async function fixtureMessage(
  uid: number,
  fixture: string,
  threadId?: string,
): Promise<InboundEmailSourceMessage> {
  const source = new Uint8Array(
    await Bun.file(
      new URL(`fixtures/${fixture}`, import.meta.url),
    ).arrayBuffer(),
  );
  return {
    uid,
    source,
    receivedAt: mailboxReceivedAt,
    ...(threadId ? { threadId } : {}),
  };
}

function expectLoggerNotToContain(
  logger: ReturnType<typeof createMockLogger>,
  secret: string,
): void {
  const containsSecret = {
    asymmetricMatch(value: unknown): boolean {
      try {
        return JSON.stringify(value).includes(secret);
      } catch {
        return false;
      }
    },
  };
  for (const logMethod of [
    logger.debug,
    logger.info,
    logger.warn,
    logger.error,
  ]) {
    expect(logMethod).not.toHaveBeenCalledWith(containsSecret);
    expect(logMethod).not.toHaveBeenCalledWith(
      containsSecret,
      expect.anything(),
    );
    expect(logMethod).not.toHaveBeenCalledWith(
      expect.anything(),
      containsSecret,
    );
  }
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function createFakeClient(
  messages: InboundEmailSourceMessage[],
  requestedUids: number[],
  uidValidity = "1",
): InboundEmailClient {
  return {
    connect: async (): Promise<void> => {},
    selectMailbox: async (_mailbox: string): Promise<string> => uidValidity,
    fetchMessages: async function* (
      afterUid: number,
    ): AsyncGenerator<InboundEmailSourceMessage, void, unknown> {
      requestedUids.push(afterUid);
      for (const message of messages) {
        if (message.uid >= afterUid) yield message;
      }
    },
    fetchMessage: async (
      uid: number,
      _maxBytes: number,
      signal: AbortSignal,
    ): Promise<InboundEmailSourceMessage | undefined> => {
      if (signal.aborted) throw signal.reason;
      return messages.find((message) => message.uid === uid);
    },
    waitForChanges: waitForAbort,
    disconnect: async (): Promise<void> => {},
  };
}

describe("inbound email intake", () => {
  it("creates stable opaque references scoped to mailbox generation and UID", () => {
    const selection = { mailbox: "INBOX", uidValidity: "42" };
    const sourceRef = createInboundEmailSourceRef(selection, 7);

    expect(createInboundEmailSourceRef(selection, 7)).toBe(sourceRef);
    expect(createInboundEmailSourceRef(selection, 8)).not.toBe(sourceRef);
    expect(
      createInboundEmailSourceRef({ ...selection, uidValidity: "43" }, 7),
    ).not.toBe(sourceRef);
    expect(
      createInboundEmailSourceRef({ ...selection, mailbox: "Archive" }, 7),
    ).not.toBe(sourceRef);
    expect(sourceRef).toMatch(/^imap:[a-f0-9]{64}$/);
    expect(sourceRef).not.toContain(selection.mailbox);
  });

  it("records the private source locator before inbound publication", async () => {
    const message = await fixtureMessage(7, "plain.eml");
    const harness = createPluginHarness();
    const cursor = harness
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.locator-order-test",
        schema: z.strictObject({
          mailbox: z.string(),
          uidValidity: z.string(),
          lastUid: z.number().int().nonnegative(),
        }),
      });
    let recorded = false;
    const expectedRef = createInboundEmailSourceRef(
      { mailbox: "INBOX", uidValidity: "42" },
      7,
    );

    await intakeInboundEmail(
      createFakeClient([message], [], "42"),
      { mailbox: "INBOX", uidValidity: "42" },
      {
        cursor,
        recordSourceLocator: async (sourceRef, selection, uid) => {
          expect({ sourceRef, selection, uid }).toEqual({
            sourceRef: expectedRef,
            selection: { mailbox: "INBOX", uidValidity: "42" },
            uid: 7,
          });
          recorded = true;
        },
        publish: async () => {
          expect(recorded).toBe(true);
          return { success: false, error: "retry" };
        },
        logger: createMockLogger(),
      },
    );

    expect(recorded).toBe(true);
    expect((await cursor.get("cursor"))?.lastUid).toBe(0);
  });

  it("parses plain, HTML, multipart, and missing Message-ID fixtures", async () => {
    const plain = await parseInboundEmail(
      await fixtureMessage(1, "plain.eml"),
      "imap:fixture-1",
    );
    const html = await parseInboundEmail(
      await fixtureMessage(2, "html.eml"),
      "imap:fixture-2",
    );
    const multipart = await parseInboundEmail(
      await fixtureMessage(3, "multipart.eml", "thread-3"),
      "imap:fixture-3",
    );
    const missingId = await parseInboundEmail(
      await fixtureMessage(4, "missing-message-id.eml"),
      "imap:fixture-4",
    );

    expect(inboundEmailSchema.parse(plain)).toEqual(plain);
    expect(plain).toMatchObject({
      messageId: "<plain-1@example.com>",
      sourceRef: "imap:fixture-1",
      from: { name: "Alice Example", address: "alice@example.com" },
      to: [{ name: "Work Inbox", address: "work@example.com" }],
      subject: "Plain inquiry",
      receivedAt: mailboxReceivedAt.toISOString(),
      headers: { autoSubmitted: "no" },
    });
    expect(plain.text).toContain("Hello from the plain text fixture.");

    expect(html.html).toContain("<strong>HTML</strong>");
    expect(html.text).toContain("Hello from HTML.");
    expect(html.headers).toEqual({
      listUnsubscribe: "<mailto:unsubscribe@example.net>",
      precedence: "bulk",
    });

    expect(multipart).toMatchObject({
      messageId: "<multipart-3@example.org>",
      threadId: "thread-3",
      to: [
        { name: "Work Inbox", address: "work@example.com" },
        { name: "Archive", address: "archive@example.com" },
      ],
    });
    expect(multipart.text).toContain("Multipart plain body.");
    expect(multipart.html).toContain("Multipart <strong>HTML</strong> body.");

    expect(missingId.messageId).toMatch(
      /^<synthetic-[a-f0-9]{64}@brains\.local>$/,
    );
  });

  it("advances the UID cursor only after acknowledgement and replays a stable messageId", async () => {
    const messages = [
      await fixtureMessage(1, "plain.eml"),
      await fixtureMessage(2, "missing-message-id.eml"),
    ];
    const requestedUids: number[] = [];
    const logger = createMockLogger();
    const harness = createPluginHarness({ logger });
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient =>
            createFakeClient(messages, requestedUids),
        },
      ),
    );
    const firstAttempt: InboundEmail[] = [];
    const unsubscribe = harness.subscribe<InboundEmail>(
      EMAIL_INBOUND,
      async (message) => {
        const email = inboundEmailSchema.parse(message.payload);
        firstAttempt.push(email);
        return email.subject === "Plain inquiry"
          ? { success: true }
          : { success: false, error: "retry" };
      },
    );
    const registry = harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);
    unsubscribe();

    const replayed: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      replayed.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(requestedUids).toEqual([1, 2]);
    expect(firstAttempt.map((email) => email.subject)).toEqual([
      "Plain inquiry",
      "Missing message id",
    ]);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.messageId).toBe(firstAttempt[1]?.messageId);
    expect(replayed[0]?.sourceRef).toBe(firstAttempt[1]?.sourceRef);
    expect(replayed[0]?.sourceRef).toMatch(/^imap:[A-Za-z0-9_-]+$/);
    expect(replayed[0]?.sourceRef).not.toContain(imapConfig.mailbox);
    for (const secretContent of [
      "Missing message id",
      "This message has no Message-ID header.",
      firstAttempt[1]?.messageId,
    ]) {
      if (secretContent) expectLoggerNotToContain(logger, secretContent);
    }
  });

  it("advances past an unparseable message so later mail can flow", async () => {
    const poisonMessage: InboundEmailSourceMessage = {
      uid: 1,
      source: new TextEncoder().encode(
        "Subject: Missing sender\r\n\r\nThis message cannot be parsed.",
      ),
      receivedAt: mailboxReceivedAt,
    };
    const plainMessage = await fixtureMessage(2, "plain.eml");
    const requestedUids: number[] = [];
    const logger = createMockLogger();
    let connection = 0;
    const harness = createPluginHarness({ logger });
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient => {
            connection += 1;
            return createFakeClient(
              connection === 1
                ? [poisonMessage]
                : [poisonMessage, plainMessage],
              requestedUids,
            );
          },
        },
      ),
    );
    const received: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      received.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });
    const registry = harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(requestedUids).toEqual([1, 2]);
    expect(received.map((email) => email.messageId)).toEqual([
      "<plain-1@example.com>",
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      "Inbound email message could not be parsed",
      { uid: 1 },
    );
  });

  it("resets the cursor when UIDVALIDITY changes and replays stable message IDs", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    let connection = 0;
    const harness = createPluginHarness();
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient => {
            connection += 1;
            return createFakeClient(
              messages,
              requestedUids,
              String(connection),
            );
          },
        },
      ),
    );
    const received: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      received.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });
    const registry = harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(requestedUids).toEqual([1, 1]);
    expect(received).toHaveLength(2);
    expect(received[1]?.messageId).toBe(received[0]?.messageId);
  });

  it("resets the cursor when the mailbox changes despite an equal UIDVALIDITY", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    const client = createFakeClient(messages, requestedUids);
    const cursor = createPluginHarness()
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.mailbox-change-test",
        schema: z.strictObject({
          mailbox: z.string(),
          uidValidity: z.string(),
          lastUid: z.number().int().nonnegative(),
        }),
      });
    const logger = createMockLogger();
    const received: InboundEmail[] = [];

    await intakeInboundEmail(
      client,
      { mailbox: "INBOX", uidValidity: "1" },
      {
        cursor,
        publish: async (request) => {
          received.push(inboundEmailSchema.parse(request.payload));
          return { success: true };
        },
        logger,
      },
    );
    await intakeInboundEmail(
      client,
      { mailbox: "Archive", uidValidity: "1" },
      {
        cursor,
        publish: async (request) => {
          received.push(inboundEmailSchema.parse(request.payload));
          return { success: true };
        },
        logger,
      },
    );

    expect(requestedUids).toEqual([1, 1]);
    expect(received).toHaveLength(2);
    expect(received[1]?.messageId).toBe(received[0]?.messageId);
  });

  it("normalizes and enriches known senders without exposing their raw address", async () => {
    const fixture = await fixtureMessage(1, "plain.eml");
    const messages = [
      {
        ...fixture,
        source: Buffer.from(
          Buffer.from(fixture.source)
            .toString("utf8")
            .replace("alice@example.com", "Alice@Example.COM"),
        ),
      },
    ];
    const requestedUids: number[] = [];
    const logger = createMockLogger();
    const harness = createPluginHarness({ logger });
    harness.subscribe(AUTH_PRINCIPAL_RESOLVE_CHANNEL, async (message) => {
      const request = authPrincipalResolveRequestSchema.parse(message.payload);
      expect(request.actor).toEqual({
        kind: "external",
        externalActorId: createExternalActorId("email", "alice@example.com"),
      });
      expect(JSON.stringify(message.payload)).not.toContain(
        "Alice@Example.COM",
      );
      expect(JSON.stringify(message.payload)).not.toContain(
        "alice@example.com",
      );
      return {
        success: true,
        data: {
          principal: {
            userId: "usr_alice",
            personId: "prsn_alice",
            canonicalId: "user:alice",
            displayName: "Alice Example",
            permissionLevel: "trusted",
          },
        },
      };
    });
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient =>
            createFakeClient(messages, requestedUids),
        },
      ),
    );
    const received: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      received.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });

    const registry = harness.getMockShell().getDaemonRegistry();
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(received[0]?.sender).toEqual({
      personId: "prsn_alice",
      displayName: "Alice Example",
      permissionLevel: "trusted",
    });
    expectLoggerNotToContain(logger, "Alice@Example.COM");
    expectLoggerNotToContain(logger, "alice@example.com");
  });

  it("warns with only a derived message key when sender resolution fails", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    const logger = createMockLogger();
    const harness = createPluginHarness({ logger });
    harness.subscribe(AUTH_PRINCIPAL_RESOLVE_CHANNEL, async () => {
      throw new Error("alice@example.com must not leak");
    });
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient =>
            createFakeClient(messages, requestedUids),
        },
      ),
    );
    const received: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      received.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });

    const registry = harness.getMockShell().getDaemonRegistry();
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(received[0]?.sender).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Inbound email sender resolution failed",
      {
        messageKey:
          "84b6ea72aa5d7f15817967b4443af2669be52663eb24ad3f1cc46d6e3aa93cf2",
      },
    );
    expectLoggerNotToContain(logger, "alice@example.com");
    expectLoggerNotToContain(logger, "<plain-1@example.com>");
  });

  it("leaves unknown senders unenriched", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    const harness = createPluginHarness();
    await harness.installPlugin(
      emailPlugin(
        { imap: imapConfig },
        {
          imapClientFactory: (): InboundEmailClient =>
            createFakeClient(messages, requestedUids),
        },
      ),
    );
    const received: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      received.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });

    const registry = harness.getMockShell().getDaemonRegistry();
    await registry.startPlugin(EMAIL_PLUGIN_ID);
    await registry.stopPlugin(EMAIL_PLUGIN_ID);

    expect(received[0]?.sender).toBeUndefined();
  });

  it("does not advance the cursor when no subscriber is installed", async () => {
    const messages = [await fixtureMessage(10, "plain.eml")];
    const requestedUids: number[] = [];
    const client = createFakeClient(messages, requestedUids);
    const cursor = createPluginHarness()
      .getMockShell()
      .getRuntimeState()
      .scoped({
        namespace: "email.inbound.no-subscriber-test",
        schema: z.strictObject({
          mailbox: z.string(),
          uidValidity: z.string(),
          lastUid: z.number().int().nonnegative(),
        }),
      });
    const logger = createMockLogger();
    const selection = { mailbox: "INBOX", uidValidity: "1" };

    await intakeInboundEmail(client, selection, {
      cursor,
      publish: async () => ({
        success: false,
        error: `No handler found for message type: ${EMAIL_INBOUND}`,
      }),
      logger,
    });

    const received: InboundEmail[] = [];
    await intakeInboundEmail(client, selection, {
      cursor,
      publish: async (request) => {
        received.push(inboundEmailSchema.parse(request.payload));
        return { success: true };
      },
      logger,
    });

    expect(requestedUids).toEqual([1, 1]);
    expect(received).toHaveLength(1);
  });
});
