import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { produceFile } from "../src/turso-worker/file-produce";

test("actor-local production hashes and writes bounded chunks without replacing output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-produce-"));
  const outputFile = join(directory, "produced");
  const bytes = Buffer.alloc(64 * 1024 + 1, 0x5a);
  try {
    const result = await produceFile(
      { sourceDirectory: directory, outputFile },
      async () => bytes,
    );
    expect(result).toEqual({
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(await readFile(outputFile)).toEqual(bytes);
    await assert.rejects(
      produceFile({ sourceDirectory: directory, outputFile }, async () =>
        Buffer.from("replacement"),
      ),
    );
    expect(await readFile(outputFile)).toEqual(bytes);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("production rejects pre-cancelled and malformed input before invoking the SDK", async () => {
  let calls = 0;
  const capture = async (): Promise<Uint8Array> => {
    calls++;
    return new Uint8Array(1);
  };
  const caller = new AbortController();
  const reason = new Error("cancelled");
  caller.abort(reason);
  await assert.rejects(
    produceFile(
      { sourceDirectory: "/trusted", outputFile: "/trusted/output" },
      capture,
      caller.signal,
    ),
    (error: unknown) => error === reason,
  );
  await assert.rejects(
    produceFile(
      { sourceDirectory: "relative", outputFile: "/trusted/output" },
      capture,
    ),
  );
  let payloadReads = 0;
  const synthetic = {
    sourceDirectory: "/trusted",
    outputFile: "/trusted/output",
    get data(): never {
      payloadReads++;
      throw new Error("Payload accessed");
    },
  };
  await assert.rejects(produceFile(synthetic, capture));
  expect(payloadReads).toBe(0);
  expect(calls).toBe(0);
});

test("oversized SDK results and interrupted staging never replace an existing file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-produce-failure-"));
  const outputFile = join(directory, "produced");
  await writeFile(outputFile, "previous");
  // Fault-injected size, not a claim about SDK/native peak allocations.
  const oversized = new Uint8Array(1);
  Object.defineProperty(oversized, "byteLength", {
    value: 100 * 1024 * 1024 + 1,
  });
  try {
    await assert.rejects(
      produceFile(
        { sourceDirectory: directory, outputFile },
        async () => oversized,
      ),
      /size limit/,
    );
    const caller = new AbortController();
    const reason = new Error("capture cancelled");
    await assert.rejects(
      produceFile(
        { sourceDirectory: directory, outputFile },
        async () => {
          caller.abort(reason);
          return new Uint8Array(1);
        },
        caller.signal,
      ),
      (error: unknown) => error === reason,
    );
    expect(await readFile(outputFile, "utf8")).toBe("previous");
    expect(
      (await readdir(directory)).filter((name) => name.endsWith(".partial")),
    ).toHaveLength(2);
  } finally {
    await rm(directory, { recursive: true });
  }
});
