import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type HeaderLines } from "mailparser";
import type { IRuntimeStateStore, MessageSender } from "@brains/plugins";
import { sha256Hex } from "@brains/utils/hash";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export const EMAIL_INBOUND = "email:inbound" as const;

export interface InboundEmailAddress {
  name?: string | undefined;
  address: string;
}

export interface InboundEmailSender {
  personId: string;
  permissionLevel: "admin" | "trusted" | "public";
}

export interface InboundEmail {
  messageId: string;
  threadId?: string | undefined;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  subject: string;
  receivedAt: string;
  text: string;
  html?: string | undefined;
  headers: {
    listUnsubscribe?: string | undefined;
    autoSubmitted?: string | undefined;
    precedence?: string | undefined;
  };
  sender?: InboundEmailSender | undefined;
}

const inboundEmailAddressSchema: z.ZodType<
  InboundEmailAddress,
  InboundEmailAddress
> = z.strictObject({
  name: z.string().min(1).optional(),
  address: z.email(),
});

export const inboundEmailSchema: z.ZodType<InboundEmail, InboundEmail> =
  z.strictObject({
    messageId: z.string().min(1),
    threadId: z.string().min(1).optional(),
    from: inboundEmailAddressSchema,
    to: z.array(inboundEmailAddressSchema),
    subject: z.string(),
    receivedAt: z.iso.datetime(),
    text: z.string(),
    html: z.string().min(1).optional(),
    headers: z.strictObject({
      listUnsubscribe: z.string().min(1).optional(),
      autoSubmitted: z.string().min(1).optional(),
      precedence: z.string().min(1).optional(),
    }),
    sender: z
      .strictObject({
        personId: z.string().min(1),
        permissionLevel: z.enum(["admin", "trusted", "public"]),
      })
      .optional(),
  });

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
}

export interface InboundEmailClient {
  connect: () => Promise<void>;
  /** Select a mailbox and return its IMAP UIDVALIDITY as a decimal string. */
  selectMailbox: (mailbox: string) => Promise<string>;
  fetchMessages: (afterUid: number) => AsyncIterable<InboundEmailSourceMessage>;
  waitForChanges: (signal: AbortSignal) => Promise<void>;
  disconnect: () => Promise<void>;
}

export type InboundEmailClientFactory = (
  config: EmailImapConfig,
) => InboundEmailClient;

export function createInboundEmailClient(
  config: EmailImapConfig,
): InboundEmailClient {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    disableAutoIdle: true,
    maxIdleTime: config.pollIntervalMs,
    logger: false,
  });

  return {
    connect: async (): Promise<void> => {
      await client.connect();
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

export interface InboundEmailCursor {
  uidValidity: string;
  lastUid: number;
}

export interface InboundEmailIntakeDependencies {
  cursor: IRuntimeStateStore<InboundEmailCursor>;
  publish: MessageSender;
  resolveSender?:
    ((address: string) => Promise<InboundEmailSender | undefined>) | undefined;
  logger: Logger;
}

export async function intakeInboundEmail(
  client: InboundEmailClient,
  uidValidity: string,
  dependencies: InboundEmailIntakeDependencies,
): Promise<number> {
  const { cursor, publish, resolveSender, logger } = dependencies;
  const storedCursor = await cursor.get("cursor");
  const lastUid =
    storedCursor?.uidValidity === uidValidity ? storedCursor.lastUid : 0;
  if (storedCursor?.uidValidity !== uidValidity) {
    await cursor.set("cursor", { uidValidity, lastUid: 0 });
  }
  let cursorUid = lastUid;
  let processed = 0;

  for await (const sourceMessage of client.fetchMessages(lastUid + 1)) {
    if (sourceMessage.uid <= cursorUid) continue;
    let email: InboundEmail;
    try {
      email = await parseInboundEmail(sourceMessage);
    } catch {
      logger.warn("Inbound email message could not be parsed", {
        uid: sourceMessage.uid,
      });
      await cursor.set("cursor", {
        uidValidity,
        lastUid: sourceMessage.uid,
      });
      cursorUid = sourceMessage.uid;
      continue;
    }

    if (resolveSender) {
      try {
        const sender = await resolveSender(email.from.address);
        if (sender) email = { ...email, sender };
      } catch {
        logger.warn("Inbound email sender resolution failed", {
          messageId: email.messageId,
        });
      }
    }

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
      logger.warn("Inbound email event was not acknowledged", {
        messageId: email.messageId,
      });
      break;
    }

    await cursor.set("cursor", {
      uidValidity,
      lastUid: sourceMessage.uid,
    });
    cursorUid = sourceMessage.uid;
    processed += 1;
    logger.debug("Inbound email event published", {
      messageId: email.messageId,
    });
  }

  return processed;
}

export async function parseInboundEmail(
  sourceMessage: InboundEmailSourceMessage,
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
  const html = typeof parsed.html === "string" ? parsed.html : undefined;
  const email: InboundEmail = {
    messageId,
    ...(sourceMessage.threadId ? { threadId: sourceMessage.threadId } : {}),
    from,
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
