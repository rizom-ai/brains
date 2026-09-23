import { expect, test } from "bun:test";
import {
  ImapFlow,
  type FetchMessageObject,
  type MailboxObject,
} from "imapflow";
import { readImapSource } from "../src/email-source-actor";
import type { EmailSourceRequest } from "../src/email-source";

const request: EmailSourceRequest = {
  config: {
    host: "fixture.invalid",
    port: 993,
    user: "fixture",
    password: "secret",
    mailbox: "INBOX",
    pollMode: "idle",
    pollIntervalMs: 1000,
  },
  selection: { mailbox: "Archive", uidValidity: "42" },
  uid: 7,
  maxBytes: 1024,
  allowTruncated: false,
};
const bytes = Buffer.from(
  "From: sender@example.com\r\nSubject: Fixture\r\n\r\nText",
);
class SourceImap extends ImapFlow {
  literals = 0;
  retired = false;
  readonly retrievalError = new Error("Retrieval failed");
  readonly retirementError = new Error("Retirement failed");
  constructor(readonlyMode: string) {
    super({
      host: "fixture.invalid",
      port: 993,
      auth: { user: "fixture", pass: "fixture" },
      logger: false,
    });
    this.mode = readonlyMode;
    this.usable = true;
  }
  private readonly mode: string;
  public override async connect(): Promise<void> {
    /* Explicit SDK collaborator. */
  }
  public override async mailboxOpen(
    ...args: Parameters<ImapFlow["mailboxOpen"]>
  ): Promise<MailboxObject> {
    expect(args).toEqual(["Archive", { readOnly: true }]);
    return {
      path: "Archive",
      delimiter: "/",
      flags: new Set(),
      uidValidity: this.mode === "generation" ? 43n : 42n,
      uidNext: 8,
      exists: 1,
    };
  }
  public override async fetchOne(
    ...args: Parameters<ImapFlow["fetchOne"]>
  ): Promise<FetchMessageObject> {
    expect(args[0]).toBe("7");
    expect(args[2]).toEqual({ uid: true });
    if (this.mode === "failure") throw this.retrievalError;
    if (!args[1].source)
      return {
        seq: 1,
        uid: 7,
        size:
          this.mode === "oversized"
            ? 1025
            : this.mode === "partial"
              ? bytes.length + 1
              : bytes.length,
      };
    expect(args[1].source).toEqual({ maxLength: 1024 });
    this.literals++;
    return {
      seq: 1,
      uid: 7,
      source: bytes,
      internalDate: new Date("2026-04-15T09:00:00Z"),
      threadId: "thread",
    };
  }
  public override async logout(): Promise<void> {
    this.retired = true;
    if (this.mode === "failure") throw this.retirementError;
  }
  public override close(): void {
    this.retired = true;
  }
}
async function rejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    (): never => {
      throw new Error("Unexpected success");
    },
    (error: unknown): unknown => error,
  );
}

test.each(["complete", "oversized", "partial"])(
  "actor retrieval applies the intake ceiling: %s",
  async (mode) => {
    const transport = new SourceImap(mode);
    const pending = readImapSource(
      request,
      new AbortController().signal,
      () => transport,
    );
    if (mode === "partial")
      expect(await rejection(pending)).toEqual(
        new Error("Email source was truncated during intake"),
      );
    else if (mode === "oversized") expect(await pending).toBeUndefined();
    else expect((await pending)?.source).toEqual(bytes);
    expect(transport.literals).toBe(mode === "oversized" ? 0 : 1);
    expect(transport.retired).toBe(true);
  },
);

test("source rereads retain explicit truncation facts", async () => {
  const transport = new SourceImap("partial");
  const result = await readImapSource(
    { ...request, allowTruncated: true },
    new AbortController().signal,
    () => transport,
  );
  expect(result?.sourceTruncated).toBe(true);
  expect(result?.threadId).toBe("thread");
  expect(transport.retired).toBe(true);
});

test("mailbox generation mismatch prevents literal retrieval", async () => {
  const transport = new SourceImap("generation");
  expect(
    await rejection(
      readImapSource(request, new AbortController().signal, () => transport),
    ),
  ).toEqual(new Error("Email source mailbox generation changed"));
  expect(transport.literals).toBe(0);
  expect(transport.retired).toBe(true);
});

test("retrieval and retirement failures remain distinct", async () => {
  const transport = new SourceImap("failure");
  const error = await rejection(
    readImapSource(request, new AbortController().signal, () => transport),
  );
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError)) throw error;
  expect(error.errors).toEqual([
    transport.retrievalError,
    transport.retirementError,
  ]);
  expect(transport.retired).toBe(true);
});
