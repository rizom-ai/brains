import type { EventEmitter } from "node:events";
import { isIP } from "node:net";
import type { ConnectionOptions } from "node:tls";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type HeaderLines } from "mailparser";
import {
  EMAIL_INBOUND,
  inboundEmailSchema,
  type InboundEmail,
  type InboundEmailAddress,
  type InboundEmailSender,
} from "@brains/contracts";
import type { IRuntimeStateStore } from "@brains/sdk/interfaces";

/**
 * Handing an arrived email on. Narrower than the shell bus: intake only
 * publishes and only cares whether the event was acknowledged.
 */
export type InboundEmailPublisher = (message: {
  readonly type: string;
  readonly payload: unknown;
}) => Promise<unknown>;
import { sha256Hex } from "@brains/utils/hash";
import type { Logger } from "@brains/utils/logger";

export interface EmailImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  pollMode: "idle" | "interval";
  pollIntervalMs: number;
}

export interface EmailImapConfigInput {
  host: string;
  port: number | string;
  user: string;
  password: string;
  mailbox?: string | undefined;
  pollMode?: "idle" | "interval" | undefined;
  pollIntervalMs?: number | string | undefined;
}

export interface InboundEmailSourceMessage {
  uid: number;
  source: Uint8Array;
  receivedAt: Date;
  threadId?: string | undefined;
  sourceTruncated?: boolean | undefined;
}

export interface InboundEmailClient {
  connect: () => Promise<void>;
  /** Select a mailbox and return its IMAP UIDVALIDITY as a decimal string. */
  selectMailbox: (mailbox: string) => Promise<string>;
  fetchMessages: (afterUid: number) => AsyncIterable<InboundEmailSourceMessage>;
  fetchMessage?: (
    uid: number,
    maxBytes: number,
    signal: AbortSignal,
  ) => Promise<InboundEmailSourceMessage | undefined>;
  waitForChanges: (signal: AbortSignal) => Promise<void>;
  disconnect: () => Promise<void>;
}

export type InboundEmailClientFactory = (
  config: EmailImapConfig,
) => InboundEmailClient;

export async function connectImapWithIpv4TlsFallback<T>(
  host: string,
  connect: (family?: 4) => Promise<T>,
): Promise<T> {
  try {
    return await connect();
  } catch (error) {
    if (!shouldRetryImapTlsOverIpv4(host, error)) throw error;
    return connect(4);
  }
}

export function createInboundEmailClient(
  config: EmailImapConfig,
): InboundEmailClient {
  let client = createImapFlow(config);

  return {
    connect: async (): Promise<void> => {
      client = await connectImapWithIpv4TlsFallback(
        config.host,
        async (family) => {
          if (family === 4) {
            client.close();
            client = createImapFlow(config, family);
          }
          await client.connect();
          return client;
        },
      );
    },
    selectMailbox: async (mailbox: string): Promise<string> => {
      const selected = await client.mailboxOpen(mailbox, { readOnly: true });
      return selected.uidValidity.toString();
    },
    fetchMessages: async function* (
      afterUid: number,
    ): AsyncGenerator<InboundEmailSourceMessage, void, unknown> {
      const messages = client.fetch(
        `${afterUid}:*`,
        {
          uid: true,
          source: true,
          internalDate: true,
          threadId: true,
        },
        { uid: true },
      );
      for await (const message of messages) {
        // IMAP sequence ranges can include the last message when afterUid is
        // higher than the mailbox's current maximum UID.
        if (message.uid < afterUid) continue;
        if (!message.source || !message.internalDate) {
          throw new Error("Inbound email source was incomplete");
        }
        yield {
          uid: message.uid,
          source: message.source,
          receivedAt: new Date(message.internalDate),
          ...(message.threadId ? { threadId: message.threadId } : {}),
        };
      }
    },
    fetchMessage: async (
      uid: number,
      maxBytes: number,
      signal: AbortSignal,
    ): Promise<InboundEmailSourceMessage | undefined> => {
      if (signal.aborted) throw signal.reason;
      const abort = (): void => client.close();
      signal.addEventListener("abort", abort, { once: true });
      try {
        const message = await client.fetchOne(
          String(uid),
          {
            uid: true,
            source: { maxLength: maxBytes },
            size: true,
            internalDate: true,
            threadId: true,
          },
          { uid: true },
        );
        if (
          !message ||
          message.uid !== uid ||
          !message.source ||
          !message.internalDate
        ) {
          return undefined;
        }
        return {
          uid,
          source: message.source,
          receivedAt: new Date(message.internalDate),
          ...(message.threadId ? { threadId: message.threadId } : {}),
          ...(message.size !== undefined && message.source.length < message.size
            ? { sourceTruncated: true }
            : {}),
        };
      } finally {
        signal.removeEventListener("abort", abort);
      }
    },
    waitForChanges: (signal: AbortSignal): Promise<void> => {
      if (signal.aborted) return Promise.reject(signal.reason);

      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = (): void => {
          client.off("exists", succeed);
          client.off("close", fail);
          client.off("error", fail);
          signal.removeEventListener("abort", abort);
        };
        const succeed = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const fail = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("Inbound email IDLE failed"));
        };
        const abort = (): void => {
          client.close();
          fail();
        };

        client.on("exists", succeed);
        client.on("close", fail);
        client.on("error", fail);
        signal.addEventListener("abort", abort, { once: true });
        void client.idle().then(succeed, fail);
      });
    },
    disconnect: async (): Promise<void> => {
      if (client.usable) {
        await client.logout();
      } else {
        client.close();
      }
    },
  };
}

function createImapFlow(config: EmailImapConfig, family?: 4): ImapFlow {
  const tls: (ConnectionOptions & { family: 4 }) | undefined =
    family === 4 ? { family } : undefined;
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    disableAutoIdle: true,
    maxIdleTime: config.pollIntervalMs,
    logger: false,
    ...(tls ? { tls } : {}),
  });
  preventUnhandledImapErrors(client);
  return client;
}

export function preventUnhandledImapErrors(client: EventEmitter): void {
  // Operation promises surface transport failures to the supervisor. Keep a
  // listener attached between interval polls so EventEmitter does not turn a
  // socket timeout into an uncaught exception before reconnection can run.
  client.on("error", () => undefined);
}

function shouldRetryImapTlsOverIpv4(host: string, error: unknown): boolean {
  if (isIP(host) !== 0) return false;
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return error.code === "ERR_TLS_CERT_ALTNAME_INVALID";
}

/** The mailbox generation a UID cursor is valid for. */
export interface InboundEmailSelection {
  mailbox: string;
  uidValidity: string;
}

export interface InboundEmailCursor {
  mailbox: string;
  uidValidity: string;
  lastUid: number;
}

export function createInboundEmailSourceRef(
  selection: InboundEmailSelection,
  uid: number,
): string {
  const locator = JSON.stringify({
    mailbox: selection.mailbox,
    uidValidity: selection.uidValidity,
    uid,
  });
  return `imap:${sha256Hex(locator)}`;
}

export interface InboundEmailIntakeDependencies {
  cursor: IRuntimeStateStore<InboundEmailCursor>;
  publish: InboundEmailPublisher;
  resolveSender?:
    ((address: string) => Promise<InboundEmailSender | undefined>) | undefined;
  recordSourceLocator?:
    | ((
        sourceRef: string,
        selection: InboundEmailSelection,
        uid: number,
      ) => Promise<void>)
    | undefined;
  pruneSourceLocators?: (() => Promise<void>) | undefined;
  logger: Logger;
}

export async function intakeInboundEmail(
  client: InboundEmailClient,
  selection: InboundEmailSelection,
  dependencies: InboundEmailIntakeDependencies,
): Promise<number> {
  const {
    cursor,
    publish,
    resolveSender,
    recordSourceLocator,
    pruneSourceLocators,
    logger,
  } = dependencies;
  const storedCursor = await cursor.get("cursor");
  // A UID cursor is meaningful only within one mailbox generation; distinct
  // mailboxes can share a UIDVALIDITY value, so both fields gate reuse.
  const cursorMatches =
    storedCursor !== null &&
    storedCursor.mailbox === selection.mailbox &&
    storedCursor.uidValidity === selection.uidValidity;
  const lastUid = cursorMatches ? storedCursor.lastUid : 0;
  if (!cursorMatches) {
    await cursor.set("cursor", { ...selection, lastUid: 0 });
  }
  let cursorUid = lastUid;
  let processed = 0;

  for await (const sourceMessage of client.fetchMessages(lastUid + 1)) {
    if (sourceMessage.uid <= cursorUid) continue;
    let email: InboundEmail;
    try {
      email = await parseInboundEmail(
        sourceMessage,
        createInboundEmailSourceRef(selection, sourceMessage.uid),
      );
    } catch {
      logger.warn("Inbound email message could not be parsed", {
        uid: sourceMessage.uid,
      });
      await cursor.set("cursor", {
        ...selection,
        lastUid: sourceMessage.uid,
      });
      cursorUid = sourceMessage.uid;
      continue;
    }

    if (recordSourceLocator) {
      try {
        await recordSourceLocator(
          email.sourceRef,
          selection,
          sourceMessage.uid,
        );
      } catch {
        logger.warn("Inbound email source locator could not be recorded", {
          uid: sourceMessage.uid,
        });
        break;
      }
    }

    if (resolveSender) {
      try {
        const sender = await resolveSender(email.from.address);
        if (sender) email = { ...email, sender };
      } catch {
        logger.warn("Inbound email sender resolution failed", {
          messageKey: sha256Hex(email.messageId),
        });
      }
    }

    let acknowledged = false;
    try {
      const response = await publish({
        type: EMAIL_INBOUND,
        payload: email,
      });
      acknowledged =
        typeof response === "object" &&
        response !== null &&
        "success" in response &&
        response.success === true;
    } catch {
      // Publishing failures are retried from the durable mailbox cursor.
    }

    if (!acknowledged) {
      logger.warn("Inbound email event was not acknowledged", {
        messageKey: sha256Hex(email.messageId),
      });
      break;
    }

    await cursor.set("cursor", {
      ...selection,
      lastUid: sourceMessage.uid,
    });
    cursorUid = sourceMessage.uid;
    processed += 1;
    logger.debug("Inbound email event published", {
      messageKey: sha256Hex(email.messageId),
    });
  }

  if (pruneSourceLocators) {
    try {
      await pruneSourceLocators();
    } catch {
      logger.warn("Inbound email source locator retention failed");
    }
  }

  return processed;
}

export async function parseInboundEmail(
  sourceMessage: InboundEmailSourceMessage,
  sourceRef: string,
): Promise<InboundEmail> {
  const parsed = await simpleParser(Buffer.from(sourceMessage.source), {
    skipImageLinks: true,
  });
  const from = firstAddress(parsed.from);
  if (!from) {
    throw new Error("Inbound email sender was missing");
  }

  const messageId = messageIdOrSynthetic(
    parsed.messageId,
    sourceMessage.source,
  );
  const replyTo = firstAddress(parsed.replyTo);
  const references = normalizeReferences(parsed.references);
  const html = typeof parsed.html === "string" ? parsed.html : undefined;
  const email: InboundEmail = {
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
      ...(references.length > 0 ? { references } : {}),
    },
  };
  return inboundEmailSchema.parse(email);
}

function messageIdOrSynthetic(
  messageId: string | undefined,
  source: Uint8Array,
): string {
  const normalized = messageId?.trim();
  if (normalized) return normalized;
  const sourceBase64 = Buffer.from(source).toString("base64");
  return `<synthetic-${sha256Hex(sourceBase64)}@brains.local>`;
}

function addresses(
  value: AddressObject | AddressObject[] | undefined,
): InboundEmailAddress[] {
  const addressObjects = value ? (Array.isArray(value) ? value : [value]) : [];
  return addressObjects.flatMap((addressObject) =>
    addressObject.value.flatMap((entry) => {
      if (entry.group) {
        return entry.group.flatMap((groupEntry) => toAddress(groupEntry));
      }
      return toAddress(entry);
    }),
  );
}

function firstAddress(
  value: AddressObject | undefined,
): InboundEmailAddress | undefined {
  return addresses(value)[0];
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

function normalizeReferences(input: string | string[] | undefined): string[] {
  return (typeof input === "string" ? [input] : (input ?? []))
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0);
}

function optionalHeader(
  headerLines: HeaderLines,
  headerName: string,
  key: "listUnsubscribe" | "autoSubmitted" | "precedence",
): Partial<InboundEmail["headers"]> {
  const line = headerLines.find(
    (candidate) => candidate.key === headerName,
  )?.line;
  const separator = line?.indexOf(":") ?? -1;
  const value = separator >= 0 ? line?.slice(separator + 1).trim() : undefined;
  if (!value) return {};

  switch (key) {
    case "listUnsubscribe":
      return { listUnsubscribe: value };
    case "autoSubmitted":
      return { autoSubmitted: value };
    case "precedence":
      return { precedence: value };
  }
}
