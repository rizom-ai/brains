import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readExtractedTextFile } from "../src/extracted-text-file";

test("extracted text verifies full receipts and split UTF-8 without relaxing metadata budgets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "extracted-text-test-"));
  const path = join(directory, "text");
  const text = "x".repeat(32767) + "🎉" + "y".repeat(65536);
  const bytes = Buffer.from(text);
  const options = {
    maxBytes: 200000,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    signal: new AbortController().signal,
  };
  try {
    await writeFile(path, bytes);
    expect(await readExtractedTextFile(path, options)).toBe(text);
    await assert.rejects(
      readExtractedTextFile(path, { ...options, sha256: "0".repeat(64) }),
      /digest verification/,
    );
    await assert.rejects(
      readExtractedTextFile(path, { ...options, sizeBytes: bytes.length - 1 }),
      /size mismatch/,
    );
    await assert.rejects(
      readExtractedTextFile(path, {
        ...options,
        maxBytes: 16 * 1024 * 1024 + 1,
      }),
      /Invalid/,
    );
    const failure = new Error("cancelled");
    await assert.rejects(
      readExtractedTextFile(path, {
        ...options,
        signal: AbortSignal.abort(failure),
      }),
      (error: unknown) => error === failure,
    );
    await symlink(path, join(directory, "link"));
    await assert.rejects(
      readExtractedTextFile(join(directory, "link"), options),
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("extracted text rejects malformed UTF-8 and accepts an empty verified result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "extracted-text-test-"));
  const path = join(directory, "text");
  try {
    const bytes = new Uint8Array([0xc3]);
    await writeFile(path, bytes);
    await assert.rejects(
      readExtractedTextFile(path, {
        maxBytes: 100,
        sizeBytes: 1,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        signal: new AbortController().signal,
      }),
    );
    await writeFile(path, "");
    expect(
      await readExtractedTextFile(path, {
        maxBytes: 100,
        sizeBytes: 0,
        sha256: createHash("sha256").digest("hex"),
        signal: new AbortController().signal,
      }),
    ).toBe("");
  } finally {
    await rm(directory, { recursive: true });
  }
});
