import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { readBoundedJsonFile } from "../src/bounded-json-file";

describe("bounded JSON file loans", () => {
  let directory: string;
  let path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bounded-json-file-"));
    path = join(directory, "metadata.json");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true });
  });
  test("reads exact-byte, digest-matched UTF-8 metadata", async () => {
    const data = new TextEncoder().encode('{"title":"été"}');
    await writeFile(path, data);
    expect(
      await readBoundedJsonFile(path, {
        maxBytes: data.length,
        sizeBytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      }),
    ).toEqual({ title: "été" });
  });
  test("bounds bytes, not characters, and rejects contradictory receipts", async () => {
    await writeFile(path, '"é"');
    await assert.rejects(readBoundedJsonFile(path, { maxBytes: 3 }), /bounds/);
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 8, sizeBytes: 3 }),
      /bounds/,
    );
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 8, sha256: "0".repeat(64) }),
      /digest mismatch/,
    );
  });
  test("rejects symlinks and non-regular files without blocking", async () => {
    await writeFile(path, "null");
    const alias = join(directory, "alias");
    await symlink(path, alias);
    await assert.rejects(readBoundedJsonFile(alias, { maxBytes: 64 }));
    await assert.rejects(
      readBoundedJsonFile(directory, { maxBytes: 64 }),
      /not regular/,
    );
  });
  test("requires strict UTF-8 and JSON", async () => {
    await writeFile(path, new Uint8Array([34, 255, 34]));
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 64 }),
      TypeError,
    );
    await writeFile(path, "{");
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 64 }),
      SyntaxError,
    );
    await writeFile(path, "null");
    expect(await readBoundedJsonFile(path, { maxBytes: 64 })).toBeNull();
  });
  test("rejects pre-abort and invalid limits before opening", async () => {
    const caller = new AbortController();
    const reason = new Error("metadata cancelled");
    caller.abort(reason);
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 64, signal: caller.signal }),
      (error: unknown) => error === reason,
    );
    for (const maxBytes of [0, -1, 1.5, 65537])
      await assert.rejects(
        readBoundedJsonFile(path, { maxBytes }),
        /Invalid metadata file byte limit/,
      );
    await assert.rejects(
      readBoundedJsonFile(path, { maxBytes: 8, sizeBytes: 9 }),
      /receipt size/,
    );
  });
});
