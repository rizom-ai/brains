import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  WebChatUploadStore,
  WebChatUploadStoreError,
} from "../src/upload-store";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "web-chat-upload-store-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function fixedUploadId(suffix: string): string {
  return `upload-00000000-0000-4000-8000-${suffix}`;
}

function fixedNow(): Date {
  return new Date("2026-05-30T00:00:00.000Z");
}

async function expectStoreError(
  promise: Promise<unknown>,
  code: WebChatUploadStoreError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected upload store error");
  } catch (error) {
    expect(error).toBeInstanceOf(WebChatUploadStoreError);
    expect(error instanceof WebChatUploadStoreError ? error.code : null).toBe(
      code,
    );
  }
}

describe("WebChatUploadStore", () => {
  it("stores upload metadata and content under the web-chat data directory", async () => {
    const store = new WebChatUploadStore({
      dataDir,
      createId: (): string => fixedUploadId("000000000001"),
      now: fixedNow,
    });

    const record = await store.save({
      filename: "notes.md",
      mediaType: "text/markdown",
      content: Buffer.from("# Notes"),
    });

    expect(record).toEqual({
      id: "upload-00000000-0000-4000-8000-000000000001",
      ref: {
        kind: "web-chat-upload",
        id: "upload-00000000-0000-4000-8000-000000000001",
      },
      filename: "notes.md",
      mediaType: "text/markdown",
      sizeBytes: 7,
      createdAt: "2026-05-30T00:00:00.000Z",
    });
    expect(
      await Bun.file(
        join(dataDir, "web-chat", "uploads", record.id, "content"),
      ).text(),
    ).toBe("# Notes");
    expect(
      await Bun.file(
        join(dataDir, "web-chat", "uploads", record.id, "metadata.json"),
      ).json(),
    ).toEqual(record);
  });

  it("builds route refs for stored uploads", () => {
    const store = new WebChatUploadStore({ dataDir });
    const record = {
      id: fixedUploadId("000000000001"),
      ref: {
        kind: "web-chat-upload" as const,
        id: fixedUploadId("000000000001"),
      },
      filename: "notes.md",
      mediaType: "text/markdown",
      sizeBytes: 7,
      createdAt: "2026-05-30T00:00:00.000Z",
    };

    expect(store.toResponseBody(record)).toEqual({
      ...record,
      url: `/api/chat/uploads?id=${record.id}`,
      downloadUrl: `/api/chat/uploads?id=${record.id}&download=1`,
    });
  });

  it("reads stored upload content with metadata", async () => {
    const store = new WebChatUploadStore({
      dataDir,
      createId: (): string => fixedUploadId("000000000002"),
    });
    const record = await store.save({
      filename: "notes.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });

    const resolved = await store.read(record.id);

    expect(resolved.record).toMatchObject({
      id: record.id,
      filename: "notes.txt",
      mediaType: "text/plain",
      sizeBytes: 5,
    });
    expect(resolved.content.toString("utf8")).toBe("hello");
  });

  it("rejects invalid upload ids before touching storage", async () => {
    const store = new WebChatUploadStore({ dataDir });

    await expectStoreError(store.read("../bad"), "invalid_ref");
  });

  it("rejects malformed stored upload metadata", async () => {
    const store = new WebChatUploadStore({ dataDir });
    const uploadId = fixedUploadId("000000000003");
    const uploadDir = join(dataDir, "web-chat", "uploads", uploadId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "content"), "hello");
    await writeFile(
      join(uploadDir, "metadata.json"),
      JSON.stringify({ id: uploadId }),
    );

    await expectStoreError(store.read(uploadId), "invalid_metadata");
  });

  it("prunes stale stored uploads", async () => {
    const store = new WebChatUploadStore({
      dataDir,
      createId: (): string => fixedUploadId("000000000005"),
      now: fixedNow,
      retentionMs: 24 * 60 * 60 * 1000,
      maxCount: 200,
    });
    const staleId = fixedUploadId("000000000004");
    const staleDir = join(dataDir, "web-chat", "uploads", staleId);
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, "content"), "old");
    const staleAge = new Date("2026-05-28T00:00:00.000Z");
    await utimes(staleDir, staleAge, staleAge);

    const fresh = await store.save({
      filename: "fresh.md",
      mediaType: "text/markdown",
      content: Buffer.from("fresh"),
    });

    expect(await Bun.file(join(staleDir, "content")).exists()).toBe(false);
    expect(
      await Bun.file(
        join(dataDir, "web-chat", "uploads", fresh.id, "content"),
      ).exists(),
    ).toBe(true);
  });
});
