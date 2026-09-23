import {
  readOwnedEmailSource,
  MAX_EMAIL_SOURCE_BYTES,
  type EmailSourceFiles,
} from "./email-source";
import type { EventEmitter } from "node:events";
import { isIP } from "node:net";
import type { ConnectionOptions } from "node:tls";
import { ImapFlow } from "imapflow";
import {
  EMAIL_INBOUND,
  inboundEmailSchema,
  type InboundEmail,
  type InboundEmailSender,
} from "@brains/contracts";
import type { IRuntimeStateStore, MessageSender } from "@brains/plugins";
import { sha256Hex } from "@brains/utils/hash";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export const emailImapConfigSchema: z.ZodObject<{
  host: z.ZodString;
  port: ReturnType<typeof z.coerce.number<number | string>>;
  user: z.ZodString;
  password: z.ZodString;
  mailbox: z.ZodDefault<z.ZodString>;
  pollMode: z.ZodDefault<z.ZodEnum<{ idle: "idle"; interval: "interval" }>>;
  pollIntervalMs: z.ZodDefault<
    ReturnType<typeof z.coerce.number<number | string>>
  >;
}> = z.object({
  host: z.string().min(1),
  port: z.coerce.number<number | string>().int().min(1).max(65_535),
  user: z.string().min(1),
  password: z.string().min(1),
  mailbox: z.string().min(1).default("INBOX"),
  pollMode: z.enum(["idle", "interval"]).default("idle"),
  pollIntervalMs: z.coerce
    .number<number | string>()
    .int()
    .positive()
    .default(60_000),
});

export type EmailImapConfig = z.output<typeof emailImapConfigSchema>;
export type EmailImapConfigInput = z.input<typeof emailImapConfigSchema>;

export interface InboundEmailSourceMessage {
  uid: number;
  sourceBytes: number;
  email?: InboundEmail | undefined;
  sourceTruncated?: boolean | undefined;
}

export interface InboundEmailClient {
  connect: (signal: AbortSignal) => Promise<void>;
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
  connect: (family: 4 | undefined) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  try {
    const result = await connect(undefined);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    signal.throwIfAborted();
    if (!shouldRetryImapTlsOverIpv4(host, error)) throw error;
    const result = await connect(4);
    signal.throwIfAborted();
    return result;
  }
}

export function createInboundEmailClient(
  config: EmailImapConfig,
  getFiles: () => EmailSourceFiles | undefined,
  createTransport: (
    config: EmailImapConfig,
    family?: 4,
  ) => ImapFlow = createImapFlow,
): InboundEmailClient {
  let client = createTransport(config);
  let selection: InboundEmailSelection | undefined;
  let connectionSignal: AbortSignal | undefined;
  const lifetime = new AbortController();
  const pending = new Set<Promise<InboundEmailSourceMessage>>();
  const read = (
    uid: number,
    maxBytes: number,
    allowTruncated: boolean,
    signal?: AbortSignal,
  ): Promise<InboundEmailSourceMessage> => {
    if (!selection || !connectionSignal)
      return Promise.reject(new Error("Email mailbox has not been selected"));
    const activeSignal = AbortSignal.any([
      lifetime.signal,
      connectionSignal,
      ...(signal ? [signal] : []),
    ]);
    const operation = readOwnedEmailSource(
      getFiles(),
      { config, selection, uid, maxBytes, allowTruncated },
      activeSignal,
    ).finally(() => {
      pending.delete(operation);
    });
    pending.add(operation);
    return operation;
  };

  return {
    connect: async (signal): Promise<void> => {
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      connectionSignal = signal;
      const abort = (): void => client.close();
      signal.addEventListener("abort", abort, { once: true });
      try {
        client = await connectImapWithIpv4TlsFallback(
          config.host,
          async (family) => {
            if (family === 4) {
              client.close();
              client = createTransport(config, family);
            }
            await client.connect();
            return client;
          },
          signal,
        );
      } finally {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) client.close();
      }
    },
    selectMailbox: async (mailbox: string): Promise<string> => {
      const selected = await client.mailboxOpen(mailbox, { readOnly: true });
      selection = { mailbox, uidValidity: selected.uidValidity.toString() };
      return selection.uidValidity;
    },
    fetchMessages: async function* (
      afterUid: number,
    ): AsyncGenerator<InboundEmailSourceMessage, void, unknown> {
      const messages = client.fetch(
        `${afterUid}:*`,
        {
          uid: true,
        },
        { uid: true },
      );
      for await (const message of messages) {
        // IMAP sequence ranges can include the last message when afterUid is
        // higher than the mailbox's current maximum UID.
        if (message.uid < afterUid) continue;
        yield await read(message.uid, MAX_EMAIL_SOURCE_BYTES, false);
      }
    },
    fetchMessage: async (
      uid: number,
      maxBytes: number,
      signal: AbortSignal,
    ): Promise<InboundEmailSourceMessage | undefined> => {
      return read(uid, maxBytes, true, signal);
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
      lifetime.abort(new Error("Email client disconnected"));
      const results = await Promise.allSettled([
        ...pending,
        Promise.resolve().then(() => client.close()),
      ]);
      const errors = results.flatMap((result) =>
        result.status === "rejected" &&
        result.reason !== lifetime.signal.reason &&
        result.reason !== connectionSignal?.reason
          ? [result.reason]
          : [],
      );
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(
          errors,
          "Email source operations and client retirement failed",
          { cause: errors[0] },
        );
    },
  };
}

export function createImapFlow(config: EmailImapConfig, family?: 4): ImapFlow {
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
  signal: AbortSignal;
  cursor: IRuntimeStateStore<InboundEmailCursor>;
  publish: MessageSender;
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
    signal,
  } = dependencies;
  signal.throwIfAborted();
  const storedCursor = await cursor.get("cursor");
  signal.throwIfAborted();
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

  signal.throwIfAborted();
  for await (const sourceMessage of client.fetchMessages(lastUid + 1)) {
    signal.throwIfAborted();
    if (sourceMessage.uid <= cursorUid) continue;
    let email: InboundEmail;
    try {
      email = await parseInboundEmail(
        sourceMessage,
        createInboundEmailSourceRef(selection, sourceMessage.uid),
      );
    } catch {
      signal.throwIfAborted();
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

    signal.throwIfAborted();
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

    signal.throwIfAborted();
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

    signal.throwIfAborted();
    let acknowledged = false;
    try {
      const response = await publish({
        type: EMAIL_INBOUND,
        payload: email,
      });
      acknowledged = "success" in response && response.success;
    } catch {
      // Publishing failures are retried from the durable mailbox cursor.
    }

    if (!acknowledged) {
      signal.throwIfAborted();
      logger.warn("Inbound email event was not acknowledged", {
        messageKey: sha256Hex(email.messageId),
      });
      break;
    }

    // A received acknowledgement must advance the durable cursor even when
    // cancellation arrived during publication; stopping cannot retract it.
    await cursor.set("cursor", {
      ...selection,
      lastUid: sourceMessage.uid,
    });
    cursorUid = sourceMessage.uid;
    processed += 1;
    logger.debug("Inbound email event published", {
      messageKey: sha256Hex(email.messageId),
    });
    signal.throwIfAborted();
  }

  signal.throwIfAborted();
  if (pruneSourceLocators) {
    try {
      await pruneSourceLocators();
    } catch {
      logger.warn("Inbound email source locator retention failed");
    }
  }

  return processed;
}

/** Bind native-parsed logical content to the controller's mailbox locator.
 * Raw MIME parsing is confined to the email-source actor. */
export async function parseInboundEmail(
  sourceMessage: InboundEmailSourceMessage,
  sourceRef: string,
): Promise<InboundEmail> {
  if (!sourceMessage.email)
    throw new Error("Inbound email source could not be parsed");
  return inboundEmailSchema.parse({ ...sourceMessage.email, sourceRef });
}
