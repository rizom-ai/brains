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
import {
  handleUploadDownloadRequest,
  handleUploadRequest,
} from "../src/upload-handlers";
import { chatUploadResponseSchema } from "@brains/contracts/chat";
import { readFile } from "node:fs/promises";
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

function incoming(
  body: string,
  filename = "notes.txt",
  mediaType = "text/plain",
): Request {
  const request = new Request("http://brain/api/chat/uploads", {
    method: "POST",
    headers: {
      "Content-Type": mediaType,
      "X-Upload-Filename": encodeURIComponent(filename),
    },
    body,
  });
  const forbidden = async (): Promise<never> => {
    throw new Error("Controller payload materialization forbidden");
  };
  request.arrayBuffer = forbidden;
  request.formData = forbidden;
  request.blob = forbidden;
  request.text = forbidden;
  return request;
}

test("raw ingress captures multiple credits natively, inspects before retention, and never materializes the request", async () => {
  const f = await fixture("Seed");
  f.store.save = async (): Promise<never> => {
    throw new Error("Buffered retention forbidden");
  };
  const bytes = "x".repeat(32768 * 2) + "🎉";
  try {
    const response = await handleUploadRequest(incoming(bytes), f.deps);
    expect(response.status).toBe(201);
    const record = chatUploadResponseSchema.parse(await response.json());
    expect(record.sizeBytes).toBe(Buffer.byteLength(bytes));
    expect(record.filename).toBe("notes.txt");
    expect(
      await f.store.withFile(record.id, async ({ sourceFile }) =>
        readFile(sourceFile, "utf8"),
      ),
    ).toBe(bytes);
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.read).not.toHaveBeenCalled();
    expect(f.errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test("raw ingress crosses a real outer Bun server and preserves every byte", async () => {
  const f = await fixture("Seed");
  const peer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Promise<Response> => handleUploadRequest(request, f.deps),
  });
  const text = "Native incoming body 🎉\n".repeat(2000);
  try {
    const response = await fetch(peer.url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Upload-Filename": "incoming.txt",
      },
      body: text,
    });
    expect(response.status).toBe(201);
    const record = chatUploadResponseSchema.parse(await response.json());
    expect(record.sizeBytes).toBe(Buffer.byteLength(text));
    expect(
      await f.store.withFile(record.id, async ({ sourceFile }) =>
        readFile(sourceFile, "utf8"),
      ),
    ).toBe(text);
    expect(f.errors).toEqual([]);
  } finally {
    await peer.stop(true);
    await f.cleanup();
  }
});

test("ingress relay rejects unauthorized and repeated consumers without saving twice", async () => {
  const f = await fixture("Seed");
  const files = f.deps.fileTransfers;
  const capture = files?.withCapturedFile;
  if (!files || !capture) throw new Error("Missing capture fixture");
  const save = mock(f.store.saveFile.bind(f.store));
  f.store.saveFile = save;
  try {
    await assert.rejects(
      handleUploadRequest(incoming("Single consumer"), {
        ...f.deps,
        fileTransfers: {
          ...files,
          withCapturedFile: async (
            input,
            use,
            options,
          ): ReturnType<typeof use> => {
            const unauthorized = await fetch(input.url);
            expect(unauthorized.status).toBe(403);
            return capture(
              input,
              async (file, signal): ReturnType<typeof use> => {
                const repeated = await fetch(input.url, {
                  headers: { authorization: input.authorization ?? "" },
                });
                expect(repeated.status).toBe(409);
                return use(file, signal);
              },
              options,
            );
          },
        },
      }),
      /closed or already entered/,
    );
    expect(save).not.toHaveBeenCalled();
    expect(f.inspect).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});

test("native ingress enforces the actual size without Content-Length before retention", async () => {
  const f = await fixture("Seed");
  const save = mock(f.store.saveFile.bind(f.store));
  f.store.saveFile = save;
  try {
    const response = await handleUploadRequest(
      incoming("x".repeat(100001)),
      f.deps,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("File upload too large");
    expect(save).not.toHaveBeenCalled();
    expect(f.inspect).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});

test("bad ingress signatures fail inspection before retention", async () => {
  const f = await fixture("Seed");
  const save = mock(f.store.saveFile.bind(f.store));
  f.store.saveFile = save;
  try {
    const response = await handleUploadRequest(
      incoming("%PDF-1.7", "image.png", "image/png"),
      f.deps,
    );
    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    expect(f.inspect).toHaveBeenCalledTimes(1);
  } finally {
    await f.cleanup();
  }
});

test("acknowledged ingress survives late capture failure without replay", async () => {
  const f = await fixture("Seed");
  const files = f.deps.fileTransfers;
  const capture = files?.withCapturedFile;
  if (!files || !capture) throw new Error("Missing capture fixture");
  const failure = new Error("capture retirement failed");
  const save = mock(f.store.saveFile.bind(f.store));
  f.store.saveFile = save;
  try {
    const response = await handleUploadRequest(incoming("Acknowledged"), {
      ...f.deps,
      fileTransfers: {
        ...files,
        withCapturedFile: async (
          input,
          use,
          options,
        ): ReturnType<typeof use> => {
          await capture(input, use, options);
          throw failure;
        },
      },
    });
    expect(response.status).toBe(201);
    const record = chatUploadResponseSchema.parse(await response.json());
    expect((await f.store.readRecord(record.id)).sizeBytes).toBe(12);
    expect(save).toHaveBeenCalledTimes(1);
    expect(f.errors).toHaveLength(1);
    expect(f.errors[0]).toMatchObject({ cause: failure });
  } finally {
    await f.cleanup();
  }
});
