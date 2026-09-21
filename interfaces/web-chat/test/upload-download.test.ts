import { expect, test, mock, type Mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RuntimeUploadStore } from "@brains/plugins";
import type {
  EntityServiceClient,
  EntityFileAssets,
} from "@brains/entity-service";
import { handleUploadDownloadRequest } from "../src/upload-handlers";
import { createWebChatUploadStoreScope } from "../src/upload-store";
import { installAttachmentFileFixture } from "./attachment-file-fixture";

interface DownloadFixture {
  store: RuntimeUploadStore;
  read: Mock<() => Promise<never>>;
  inspect: Mock<EntityFileAssets["inspect"]>;
  put: Mock<EntityFileAssets["putHttp"]>;
  errors: unknown[];
  held: () => number;
  deps: Parameters<typeof handleUploadDownloadRequest>[1];
  url: string;
  cleanup: () => Promise<void>;
}

async function fixture(
  content: string,
  mediaType = "text/plain",
  filename = "notes.txt",
): Promise<DownloadFixture> {
  const directory = await mkdtemp(join(tmpdir(), "upload-download-test-"));
  const store = new RuntimeUploadStore({
    dataDir: directory,
    ...createWebChatUploadStoreScope(),
  });
  const record = await store.save({
    filename,
    mediaType,
    content: Buffer.from(content),
  });
  const service: Pick<EntityServiceClient, "fileAssets"> = {};
  const close = await installAttachmentFileFixture(
    service,
    Buffer.from(content),
  );
  const files = service.fileAssets;
  if (!files) throw new Error("Missing fixture runtime");
  const put = mock(files.putHttp.bind(files));
  files.putHttp = put;
  const inspect = mock(files.inspect.bind(files));
  files.inspect = inspect;
  const read = mock(async (): Promise<never> => {
    throw new Error("Buffered upload read forbidden");
  });
  store.read = read;
  let held = 0;
  const borrow = store.withFile.bind(store);
  store.withFile = async (id, use): ReturnType<typeof use> =>
    borrow(id, async (file): ReturnType<typeof use> => {
      held++;
      try {
        return await use(file);
      } finally {
        held--;
      }
    });
  const errors: unknown[] = [];
  const deps = {
    fileTransfers: files,
    getUploadStore: (): RuntimeUploadStore => store,
    resolveAuthSession: async (): Promise<boolean> => true,
    onRetirementError: (error: unknown): void => {
      errors.push(error);
    },
  };
  return {
    store,
    read,
    inspect,
    put,
    errors,
    held: (): number => held,
    deps,
    url: `http://brain${store.toResponseBody(record).url}`,
    cleanup: async (): Promise<void> => {
      await close();
      await rm(directory, { recursive: true });
    },
  };
}

test("raw download retains the inspected loan through native body consumption without buffered reads", async () => {
  const f = await fixture("Verified text 🎉");
  try {
    const response = await handleUploadDownloadRequest(
      new Request(f.url),
      f.deps,
    );
    expect(response.status).toBe(200);
    expect(f.held()).toBe(1);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("Verified text 🎉");
    expect(f.held()).toBe(0);
    expect(f.read).not.toHaveBeenCalled();
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.put).toHaveBeenCalledTimes(1);
    expect(f.errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test("HEAD verifies policy natively but sends no payload and retires its loan", async () => {
  const f = await fixture("Head only");
  try {
    const response = await handleUploadDownloadRequest(
      new Request(f.url, { method: "HEAD" }),
      f.deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("9");
    expect(response.body).toBeNull();
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.held()).toBe(0);
  } finally {
    await f.cleanup();
  }
});

test("invalid signature or NUL text fails before HTTP submission", async () => {
  for (const [content, mime, filename] of [
    ["%PDF-1.7", "image/png", "image.png"],
    ["a\0b", "text/plain", "notes.txt"],
  ] as const) {
    const f = await fixture(content, mime, filename);
    try {
      const response = await handleUploadDownloadRequest(
        new Request(f.url),
        f.deps,
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Unsupported file upload type");
      expect(f.put).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
      expect(f.held()).toBe(0);
    } finally {
      await f.cleanup();
    }
  }
});

test("authorization and pre-abort precede inspection; missing provisioning cannot select a byte fallback", async () => {
  const f = await fixture("Protected");
  try {
    const denied = await handleUploadDownloadRequest(new Request(f.url), {
      ...f.deps,
      resolveAuthSession: async () => false,
    });
    expect(denied.status).toBe(403);
    const failure = new Error("request cancelled");
    await assert.rejects(
      handleUploadDownloadRequest(
        new Request(f.url, { signal: AbortSignal.abort(failure) }),
        f.deps,
      ),
      (error: unknown) => error === failure,
    );
    await assert.rejects(
      handleUploadDownloadRequest(new Request(f.url), {
        ...f.deps,
        fileTransfers: undefined,
      }),
      /not provisioned/,
    );
    expect(f.inspect).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});
