import { describe, expect, it } from "bun:test";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveRequestSchema,
  createExternalActorId,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";

import {
  EMAIL_INBOUND,
  EmailInterface,
  inboundEmailSchema,
  type EmailImapConfig,
  type InboundEmail,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
} from "../src";
import { z } from "@brains/utils/zod";
import { intakeInboundEmail, parseInboundEmail } from "../src/inbound-email";

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
): InboundEmailClient {
  return {
    connect: async (): Promise<void> => {},
    selectMailbox: async (_mailbox: string): Promise<void> => {},
    fetchMessages: async function* (
      afterUid: number,
    ): AsyncGenerator<InboundEmailSourceMessage, void, unknown> {
      requestedUids.push(afterUid);
      for (const message of messages) {
        if (message.uid >= afterUid) yield message;
      }
    },
    waitForChanges: waitForAbort,
    disconnect: async (): Promise<void> => {},
  };
}

describe("inbound email intake", () => {
  it("parses plain, HTML, multipart, and missing Message-ID fixtures", async () => {
    const plain = await parseInboundEmail(await fixtureMessage(1, "plain.eml"));
    const html = await parseInboundEmail(await fixtureMessage(2, "html.eml"));
    const multipart = await parseInboundEmail(
      await fixtureMessage(3, "multipart.eml", "thread-3"),
    );
    const missingId = await parseInboundEmail(
      await fixtureMessage(4, "missing-message-id.eml"),
    );

    expect(inboundEmailSchema.parse(plain)).toEqual(plain);
    expect(plain).toMatchObject({
      messageId: "<plain-1@example.com>",
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
    const harness = createPluginHarness<EmailInterface>({ logger });
    await harness.installPlugin(
      new EmailInterface(
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

    await registry.startPlugin("email");
    await registry.stopPlugin("email");
    unsubscribe();

    const replayed: InboundEmail[] = [];
    harness.subscribe<InboundEmail>(EMAIL_INBOUND, async (message) => {
      replayed.push(inboundEmailSchema.parse(message.payload));
      return { success: true };
    });
    await registry.startPlugin("email");
    await registry.stopPlugin("email");

    expect(requestedUids).toEqual([1, 2]);
    expect(firstAttempt.map((email) => email.subject)).toEqual([
      "Plain inquiry",
      "Missing message id",
    ]);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.messageId).toBe(firstAttempt[1]?.messageId);
    for (const secretContent of [
      "Missing message id",
      "This message has no Message-ID header.",
    ]) {
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining(secretContent),
      );
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining(secretContent),
      );
    }
  });

  it("enriches known senders without logging their raw address", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    const logger = createMockLogger();
    const harness = createPluginHarness<EmailInterface>({ logger });
    harness.subscribe(AUTH_PRINCIPAL_RESOLVE_CHANNEL, async (message) => {
      const request = authPrincipalResolveRequestSchema.parse(message.payload);
      expect(request.actor).toEqual({
        kind: "external",
        externalActorId: createExternalActorId("email", "alice@example.com"),
      });
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
      new EmailInterface(
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
    await registry.startPlugin("email");
    await registry.stopPlugin("email");

    expect(received[0]?.sender).toEqual({
      personId: "prsn_alice",
      permissionLevel: "trusted",
    });
    for (const logMethod of [
      logger.debug,
      logger.info,
      logger.warn,
      logger.error,
    ]) {
      expect(logMethod).not.toHaveBeenCalledWith(
        expect.stringContaining("alice@example.com"),
      );
    }
  });

  it("leaves unknown senders unenriched", async () => {
    const messages = [await fixtureMessage(1, "plain.eml")];
    const requestedUids: number[] = [];
    const harness = createPluginHarness<EmailInterface>();
    await harness.installPlugin(
      new EmailInterface(
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
    await registry.startPlugin("email");
    await registry.stopPlugin("email");

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
        schema: z.number().int().nonnegative(),
      });
    const logger = createMockLogger();

    await intakeInboundEmail(client, {
      cursor,
      publish: async () => ({
        success: false,
        error: `No handler found for message type: ${EMAIL_INBOUND}`,
      }),
      logger,
    });

    const received: InboundEmail[] = [];
    await intakeInboundEmail(client, {
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
