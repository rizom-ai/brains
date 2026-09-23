import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import { waitUntil } from "@brains/test-utils";
import {
  readOwnedEmailSource,
  MAX_EMAIL_SOURCE_BYTES,
  type EmailSourceFiles,
  type EmailSourceRequest,
} from "../src/email-source";
import { produceEmailSource } from "../src/email-source-actor";

type Producer = NonNullable<EmailSourceFiles["withProducedFile"]>;
type ProducedFile = Parameters<Parameters<Producer>[1]>[0];
type ProducerOptions = Parameters<Producer>[2];
const actor = new URL("./fixtures/email-source-actor.ts", import.meta.url);
function owner(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actor,
    downloadUrl: actor,
    producerUrls: { "email-source": actor },
  });
}
function request(path: string): EmailSourceRequest {
  return {
    config: {
      host: "fixture.invalid",
      port: 993,
      user: "fixture",
      password: path,
      mailbox: "INBOX",
      pollMode: "idle",
      pollIntervalMs: 1000,
    },
    selection: { mailbox: "INBOX", uidValidity: "42" },
    uid: 7,
    maxBytes: MAX_EMAIL_SOURCE_BYTES,
    allowTruncated: false,
  };
}

async function rejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    (): never => {
      throw new Error("Unexpected success");
    },
    (error: unknown): unknown => error,
  );
}

test.each(["attachment", "text"])(
  "MIME bytes stay in the actor; %s content follows actual exit",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "email-native-"));
    const actors = owner();
    const outputFile = join(directory, "result");
    const source = join(directory, "source.eml");
    // Test source generation only, never a controller ingress fallback.
    const body =
      mode === "text" ? "native ".repeat(15000).trim() : "Native email text";
    const raw =
      mode === "text"
        ? `From: Alice <alice@example.com>\r\nSubject: Native text\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
        : `From: Alice <alice@example.com>\r\nTo: inbox@example.com\r\nMessage-ID: <native@example.com>\r\nSubject: Native\r\nContent-Type: multipart/mixed; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain\r\n\r\nNative email text\r\n--fixture\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="large.bin"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.alloc(1024 * 1024, 0x5a).toString("base64")}\r\n--fixture--\r\n`;
    await writeFile(source, raw);
    let calls = 0;
    const files: EmailSourceFiles = {
      withProducedFile: async <T>(
        sourceDirectory: string | undefined,
        use: (file: ProducedFile, signal: AbortSignal) => Promise<T>,
        options?: ProducerOptions,
      ): Promise<T> => {
        expect(sourceDirectory).toBeUndefined();
        expect(options?.producer).toBe("email-source");
        const signal = options?.signal ?? new AbortController().signal;
        calls++;
        const facts = await actors.produce(
          {
            sourceDirectory: directory,
            outputFile,
            metadata: options?.metadata,
          },
          signal,
          options?.producer,
        );
        const pid = Number(await readFile(`${outputFile}.pid`, "utf8"));
        expect(pid).not.toBe(process.pid);
        assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
        return use({ sourceFile: outputFile, ...facts }, signal);
      },
    };
    try {
      const result = await readOwnedEmailSource(
        files,
        request(source),
        new AbortController().signal,
      );
      expect(result.sourceBytes).toBe(Buffer.byteLength(raw));
      expect(result.email?.text.trim()).toBe(body);
      expect(result.email?.from.address).toBe("alice@example.com");
      expect(result.email?.threadId).toBe("fixture-thread");
      expect(result).not.toHaveProperty("source");
      if (mode === "attachment")
        expect(JSON.stringify(result).length).toBeLessThan(4096);
      else
        expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(
          65536,
        );
      expect(calls).toBe(1);
    } finally {
      await actors.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("cancellation joins the actual source actor before the owner closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "email-native-cancel-"));
  const actors = owner();
  const outputFile = join(directory, "result");
  const input = request("unused");
  input.config.user = "wait";
  const abort = new AbortController();
  const pending = actors.produce(
    {
      sourceDirectory: directory,
      outputFile,
      metadata: { request: JSON.stringify(input) },
    },
    abort.signal,
    "email-source",
  );
  const failed = rejection(pending);
  try {
    await waitUntil(
      async () => Bun.file(`${outputFile}.pid`).exists(),
      "actor to enter source retrieval",
    );
    const pid = Number(await readFile(`${outputFile}.pid`, "utf8"));
    abort.abort(new Error("Source read stopped"));
    expect(await failed).toBe(abort.signal.reason);
    await actors.close();
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    expect(await Bun.file(outputFile).exists()).toBe(false);
  } finally {
    abort.abort();
    await actors.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing provisioning cannot fall back to controller source parsing", async () => {
  expect(
    await rejection(
      readOwnedEmailSource(
        undefined,
        request("unused"),
        new AbortController().signal,
      ),
    ),
  ).toEqual(new Error("Native email source parsing is not provisioned"));
});

test("actor request ceilings and cancellation precede provider invocation", async () => {
  const reader = mock(async (): Promise<undefined> => undefined);
  const input = request("unused");
  input.maxBytes = MAX_EMAIL_SOURCE_BYTES + 1;
  const directory = await mkdtemp(join(tmpdir(), "email-native-limit-"));
  try {
    const bad = {
      sourceDirectory: directory,
      outputFile: join(directory, "result"),
      metadata: { request: JSON.stringify(input) },
    };
    expect(
      await rejection(
        produceEmailSource(bad, new AbortController().signal, reader),
      ),
    ).toBeInstanceOf(Error);
    expect(
      await rejection(
        produceEmailSource(
          bad,
          AbortSignal.abort(new Error("Cancelled")),
          reader,
        ),
      ),
    ).toEqual(new Error("Cancelled"));
    expect(reader).not.toHaveBeenCalled();
    expect(await Bun.file(bad.outputFile).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
