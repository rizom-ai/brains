import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntityBinaryClient, EntityFileRuntime } from "@brains/entity-service";
import {
  createFileResponse,
  type FileResponseOptions,
} from "../../src/service/file-response";

async function fixture(bytes: Uint8Array): Promise<{
  options: FileResponseOptions;
  source: string;
  state: { loans: number; sends: number; errors: unknown[] };
  close(): Promise<void>;
  retired: Promise<void>;
  failed: Promise<unknown>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "owned-http-response-"));
  const source = join(directory, "source");
  await writeFile(source, bytes);
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected database operation");
  };
  const actor = new URL(
    "../../../../shared/db/src/turso-worker/file-http-upload-process.ts",
    import.meta.url,
  );
  const runtime = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: (): never => {
          throw new Error("Unexpected fence");
        },
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      httpUploadUrl: actor,
      inspectionUploadUrl: actor,
    },
  );
  const state: { loans: number; sends: number; errors: unknown[] } = {
    loans: 0,
    sends: 0,
    errors: [],
  };
  const retired = Promise.withResolvers<void>();
  const failed = Promise.withResolvers<unknown>();
  const options: FileResponseOptions = {
    headers: { "Content-Type": "application/octet-stream" },
    signal: new AbortController().signal,
    files: {
      putHttp: async (input, request) => {
        state.sends++;
        try {
          return await runtime.putHttp(input, request);
        } finally {
          state.sends--;
        }
      },
    },
    withFile: async (use, signal): Promise<void> => {
      state.loans++;
      try {
        await use(
          {
            sourceFile: source,
            sizeBytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
          signal,
        );
        await rm(source);
      } finally {
        state.loans--;
        retired.resolve();
      }
    },
    onRetirementError: (error): void => {
      state.errors.push(error);
      failed.resolve(error);
    },
  };
  return {
    options,
    source,
    state,
    retired: retired.promise,
    failed: failed.promise,
    close: async (): Promise<void> => {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("HTTP file response holds the native send and loan through real body consumption", async () => {
  const bytes = new Uint8Array(256 * 1024 + 7).fill(57);
  const fixtureValue = await fixture(bytes);
  try {
    const response = await createFileResponse(fixtureValue.options);
    expect(fixtureValue.state.loans).toBe(1);
    expect(fixtureValue.state.sends).toBe(1);
    expect(await readFile(fixtureValue.source)).toHaveLength(bytes.length);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(fixtureValue.state.loans).toBe(0);
    expect(fixtureValue.state.sends).toBe(0);
    expect(fixtureValue.state.errors).toEqual([]);
    await assert.rejects(readFile(fixtureValue.source));
  } finally {
    await fixtureValue.close();
  }
});

test("an empty response joins native retirement without relying on a body pull", async () => {
  const fixtureValue = await fixture(new Uint8Array());
  try {
    const response = await createFileResponse(fixtureValue.options);
    expect(response.headers.get("content-length")).toBe("0");
    expect(await response.text()).toBe("");
    expect(fixtureValue.state.loans).toBe(0);
    expect(fixtureValue.state.sends).toBe(0);
  } finally {
    await fixtureValue.close();
  }
});

test("body cancellation joins the sender and retains failed source staging", async () => {
  const fixtureValue = await fixture(new Uint8Array(2 * 1024 * 1024).fill(61));
  try {
    const response = await createFileResponse(fixtureValue.options);
    const reader = response.body?.getReader();
    assert.ok(reader);
    expect((await reader.read()).value?.byteLength).toBeLessThanOrEqual(
      32 * 1024,
    );
    await assert.rejects(reader.cancel(new Error("fixture consumer stopped")));
    expect(fixtureValue.state.loans).toBe(0);
    expect(fixtureValue.state.sends).toBe(0);
    expect(fixtureValue.state.errors).toHaveLength(1);
    expect(await readFile(fixtureValue.source)).toHaveLength(2 * 1024 * 1024);
  } finally {
    await fixtureValue.close();
  }
});

test("a real outer Bun server sends every byte and joins native/source retirement", async () => {
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(23);
  const value = await fixture(bytes);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const response = await createFileResponse({
        ...value.options,
        signal: request.signal,
      });
      expect(value.state.loans).toBe(1);
      return response;
    },
  });
  try {
    const response = await fetch(server.url);
    // Bun streams this Response with chunked framing rather than forwarding
    // Content-Length; verify the actual end-to-end size and digest below.
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    const reader = response.body?.getReader();
    assert.ok(reader);
    const hash = createHash("sha256");
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        hash.update(chunk.value);
        size += chunk.value.byteLength;
        await Bun.sleep(1);
      }
    } finally {
      reader.releaseLock();
    }
    await value.retired;
    expect(size).toBe(bytes.length);
    expect(hash.digest("hex")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(value.state.loans).toBe(0);
    expect(value.state.sends).toBe(0);
    expect(value.state.errors).toEqual([]);
  } finally {
    await server.stop(true);
    await value.close();
  }
});

test("external client abort joins native retirement and retains failed staging", async () => {
  const value = await fixture(new Uint8Array(8 * 1024 * 1024).fill(41));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      createFileResponse({ ...value.options, signal: request.signal }),
  });
  const abort = new AbortController();
  try {
    const response = await fetch(server.url, { signal: abort.signal });
    abort.abort(new Error("external client stopped"));
    await assert.rejects(response.arrayBuffer());
    await value.failed;
    expect(value.state.loans).toBe(0);
    expect(value.state.sends).toBe(0);
    expect(await readFile(value.source)).toHaveLength(8 * 1024 * 1024);
  } finally {
    await server.stop(true);
    await value.close();
  }
});

test("an abandoned response still retires when its request signal aborts", async () => {
  const value = await fixture(new Uint8Array(128 * 1024).fill(47));
  const abort = new AbortController();
  try {
    const response = await createFileResponse({
      ...value.options,
      signal: abort.signal,
    });
    expect(response.bodyUsed).toBe(false);
    abort.abort(new Error("request owner closed"));
    await value.failed;
    expect(value.state.loans).toBe(0);
    expect(value.state.sends).toBe(0);
    expect(await readFile(value.source)).toHaveLength(128 * 1024);
  } finally {
    await value.close();
  }
});

test("outer-server shutdown aborts and joins an unfinished native response", async () => {
  const value = await fixture(new Uint8Array(8 * 1024 * 1024).fill(59));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      createFileResponse({ ...value.options, signal: request.signal }),
  });
  try {
    const response = await fetch(server.url);
    await server.stop(true);
    await assert.rejects(response.arrayBuffer());
    await value.failed;
    expect(value.state.loans).toBe(0);
    expect(value.state.sends).toBe(0);
    expect(await readFile(value.source)).toHaveLength(8 * 1024 * 1024);
  } finally {
    await server.stop(true);
    await value.close();
  }
});

test("the final payload view is withheld until the native receipt is verified", async () => {
  const bytes = new Uint8Array(16 * 1024).fill(67);
  const value = await fixture(bytes);
  try {
    const response = await createFileResponse({
      ...value.options,
      files: {
        putHttp: async (input, options) => {
          const receipt = await value.options.files.putHttp(input, options);
          return { ...receipt, sha256: "0".repeat(64) };
        },
      },
    });
    const reader = response.body?.getReader();
    assert.ok(reader);
    let received = 0;
    try {
      await assert.rejects(async () => {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
          received += chunk.value.byteLength;
        }
      }, /did not acknowledge/);
    } finally {
      reader.releaseLock();
    }
    expect(received).toBeLessThan(bytes.length);
    expect(value.state.loans).toBe(0);
    expect(value.state.sends).toBe(0);
    expect(await readFile(value.source)).toHaveLength(bytes.length);
  } finally {
    await value.close();
  }
});

for (const violation of ["duplicate", "early return"]) {
  test(`faulty loan ${violation} aborts and joins native entry`, async () => {
    const value = await fixture(new Uint8Array(128 * 1024).fill(53));
    try {
      await assert.rejects(
        createFileResponse({
          ...value.options,
          withFile: async (use, signal): Promise<void> => {
            if (violation === "early return") {
              void value.options.withFile(use, signal).catch(() => undefined); // Deliberately faulty provider; the response owns/joins the consumer.
              return;
            }
            await value.options.withFile(async (file, owned): Promise<void> => {
              const first = use(file, owned);
              void use(file, owned).catch(() => undefined); // Deliberately ignored duplicate entry must still fail the scope.
              await first;
            }, signal);
          },
        }),
      );
      await value.retired;
      expect(value.state.loans).toBe(0);
      expect(value.state.sends).toBe(0);
      expect(await readFile(value.source)).toHaveLength(128 * 1024);
    } finally {
      await value.close();
    }
  });
}
