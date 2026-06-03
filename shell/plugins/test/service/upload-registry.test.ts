import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createServicePluginContext } from "../../src/service/context";
import {
  RuntimeUploadRegistry,
  RuntimeUploadStoreError,
  normalizeRuntimeUploadDataDir,
} from "../../src/service/upload-registry";
import { createMockShell } from "@brains/test-utils";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "runtime-upload-registry-"));
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
  code: RuntimeUploadStoreError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected upload store error");
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeUploadStoreError);
    expect(error instanceof RuntimeUploadStoreError ? error.code : null).toBe(
      code,
    );
  }
}

describe("RuntimeUploadRegistry", () => {
  it("stores scoped upload metadata and content under runtime data", async () => {
    const registry = RuntimeUploadRegistry.createFresh({ dataDir });
    const store = registry.scoped({
      namespace: "web-chat",
      refKind: "web-chat-upload",
      routePath: "/api/chat/uploads",
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
    expect(store.toResponseBody(record)).toEqual({
      ...record,
      url: `/api/chat/uploads?id=${record.id}`,
      downloadUrl: `/api/chat/uploads?id=${record.id}&download=1`,
    });
  });

  it("normalizes content brain-data to sibling runtime data", async () => {
    expect(normalizeRuntimeUploadDataDir(join(dataDir, "brain-data"))).toBe(
      join(dataDir, "data"),
    );
  });

  it("rejects malformed metadata and mismatched ref kinds", async () => {
    const registry = RuntimeUploadRegistry.createFresh({ dataDir });
    const store = registry.scoped({
      namespace: "web-chat",
      refKind: "web-chat-upload",
      routePath: "/api/chat/uploads",
    });
    const uploadId = fixedUploadId("000000000003");
    const uploadDir = join(dataDir, "web-chat", "uploads", uploadId);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "content"), "hello");
    await writeFile(
      join(uploadDir, "metadata.json"),
      JSON.stringify({
        id: uploadId,
        ref: { kind: "other-upload", id: uploadId },
        filename: "notes.txt",
        mediaType: "text/plain",
        sizeBytes: 5,
        createdAt: fixedNow().toISOString(),
      }),
    );

    await expectStoreError(store.read(uploadId), "invalid_metadata");
  });

  it("exposes scoped stores through plugin context", async () => {
    const context = createServicePluginContext(
      createMockShell({ dataDir }),
      "test-plugin",
    );
    const store = context.uploads.scoped({
      namespace: "test-plugin",
      refKind: "test-upload",
      routePath: "/api/test/uploads",
      createId: (): string => fixedUploadId("000000000004"),
    });

    const record = await store.save({
      filename: "hello.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });

    expect(record.ref.kind).toBe("test-upload");
    expect(await store.read(record.id)).toMatchObject({
      record: { filename: "hello.txt" },
    });
  });
});
