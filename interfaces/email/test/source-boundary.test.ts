import { expect, test } from "bun:test";
import {
  ImapFlow,
  type FetchMessageObject,
  type MailboxObject,
} from "imapflow";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createInboundEmailClient,
  type EmailImapConfig,
} from "../src/inbound-email";
import {
  type EmailSourceFiles,
  MAX_EMAIL_SOURCE_BYTES,
} from "../src/email-source";
import { emailSourceRequestSchema } from "../src/email-source-actor";
import { parsedFixture } from "./helpers/parsed-message";

type Producer = NonNullable<EmailSourceFiles["withProducedFile"]>;
type ProducedFile = Parameters<Parameters<Producer>[1]>[0];
type Options = Parameters<Producer>[2];
const config: EmailImapConfig = {
  host: "fixture.invalid",
  port: 993,
  user: "fixture",
  password: "fixture",
  mailbox: "INBOX",
  pollMode: "idle",
  pollIntervalMs: 1000,
};
class MetadataImap extends ImapFlow {
  closed = 0;
  constructor() {
    super({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.password },
      logger: false,
    });
  }
  public override async connect(): Promise<void> {
    /* No real network in this collaborator. */
  }
  public override async mailboxOpen(
    ...args: Parameters<ImapFlow["mailboxOpen"]>
  ): Promise<MailboxObject> {
    expect(args).toEqual(["INBOX", { readOnly: true }]);
    return {
      path: "INBOX",
      delimiter: "/",
      flags: new Set(),
      uidValidity: 42n,
      uidNext: 8,
      exists: 1,
    };
  }
  public override async *fetch(
    ...args: Parameters<ImapFlow["fetch"]>
  ): AsyncGenerator<FetchMessageObject> {
    expect(args).toEqual(["1:*", { uid: true }, { uid: true }]);
    yield {
      uid: 7,
      seq: 1,
      get source(): never {
        throw new Error("Controller read MIME bytes");
      },
    };
  }
  public override async fetchOne(): Promise<never> {
    throw new Error("Controller fetched a MIME literal");
  }
  public override close(): void {
    this.closed++;
  }
}

test("controller polling requests UID metadata only; both read modes delegate to the named producer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "email-controller-"));
  const transport = new MetadataImap();
  const modes: Array<{ maxBytes: number; allowTruncated: boolean }> = [];
  // Parsed text fixture generation, not a raw-byte ingress adapter.
  const result = await parsedFixture({
    uid: 7,
    receivedAt: new Date("2026-04-15T09:00:00Z"),
    source: new TextEncoder().encode(
      "From: fixture@example.com\r\nSubject: Fixture\r\n\r\nBody",
    ),
  });
  const text = JSON.stringify(result);
  const files: EmailSourceFiles = {
    withProducedFile: async <T>(
      source: string | undefined,
      use: (file: ProducedFile, signal: AbortSignal) => Promise<T>,
      options?: Options,
    ): Promise<T> => {
      expect(source).toBeUndefined();
      expect(options?.producer).toBe("email-source");
      const request = emailSourceRequestSchema.parse(
        JSON.parse(options?.metadata?.["request"] ?? "null"),
      );
      expect(request.selection).toEqual({
        mailbox: "INBOX",
        uidValidity: "42",
      });
      expect(request.uid).toBe(7);
      modes.push({
        maxBytes: request.maxBytes,
        allowTruncated: request.allowTruncated,
      });
      const sourceFile = join(directory, String(modes.length));
      await writeFile(sourceFile, text, { flag: "wx" });
      return use(
        {
          sourceFile,
          sizeBytes: Buffer.byteLength(text),
          sha256: createHash("sha256").update(text).digest("hex"),
        },
        options?.signal ?? new AbortController().signal,
      );
    },
  };
  const client = createInboundEmailClient(
    config,
    () => files,
    () => transport,
  );
  try {
    await client.connect(new AbortController().signal);
    expect(await client.selectMailbox("INBOX")).toBe("42");
    const messages = [];
    for await (const message of client.fetchMessages(1)) messages.push(message);
    expect(messages).toEqual([result]);
    expect(
      await client.fetchMessage?.(7, 1024 * 1024, new AbortController().signal),
    ).toEqual(result);
    expect(modes).toEqual([
      { maxBytes: MAX_EMAIL_SOURCE_BYTES, allowTruncated: false },
      { maxBytes: 1024 * 1024, allowTruncated: true },
    ]);
  } finally {
    await client.disconnect();
    await rm(directory, { recursive: true, force: true });
  }
  expect(transport.closed).toBe(1);
});
