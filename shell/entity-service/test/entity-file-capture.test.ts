import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EntityFileRuntime } from "../src/entity-file-runtime";
import { EntityBinaryClient } from "../src/entity-binary-client";

interface Fixture {
  files: EntityFileRuntime;
  url: string;
  close(): Promise<void>;
}
async function fixture(provision = true): Promise<Fixture> {
  const server = createServer((_request, response) =>
    response
      .writeHead(200, { "content-type": "application/pdf" })
      .end("captured"),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const actor = new URL(import.meta.resolve("@brains/db/file-capture-process"));
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected binary authority operation");
  };
  const client = new EntityBinaryClient({
    transport: {
      control: unexpected,
      publication: unexpected,
      invalidate: (): never => {
        throw new Error("Unexpected fence");
      },
    },
  });
  const files = new EntityFileRuntime(client, {
    executable: process.execPath,
    uploadUrl: actor,
    downloadUrl: actor,
    inspectionUploadUrl: actor,
    ...(provision && { captureUrl: actor }),
  });
  return {
    files,
    url: `http://127.0.0.1:${address.port}/file`,
    close: async (): Promise<void> => {
      await files.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("captured files remain borrowed through shutdown and acknowledge a late completed consumer", async () => {
  const setup = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let path = "";
  let closed = false;
  const record = { id: "upload-acknowledged" };
  const work = setup.files.withCapturedFile(
    { url: setup.url, maxBytes: 8 },
    async (file, signal) => {
      path = file.sourceFile;
      expect(file.sizeBytes).toBe(8);
      expect(file.details).toEqual({ mediaType: "application/pdf" });
      expect(await Bun.file(path).text()).toBe("captured");
      entered.resolve();
      await release.promise;
      expect(signal.aborted).toBe(true);
      expect(await Bun.file(path).exists()).toBe(true);
      return record;
    },
  );
  try {
    await Promise.race([entered.promise, work]);
    const closing = setup.files.close().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    release.resolve();
    expect(await work).toBe(record);
    await closing;
    expect(await Bun.file(path).exists()).toBe(false);
  } finally {
    release.resolve();
    await Promise.allSettled([work, setup.files.close()]);
    await setup.close();
  }
});

test("failed capture consumers retain their source and exact failure without replay", async () => {
  const setup = await fixture();
  const primary = new Error("retention outcome unknown");
  let path = "";
  let calls = 0;
  try {
    await assert.rejects(
      setup.files.withCapturedFile({ url: setup.url }, async (file) => {
        path = file.sourceFile;
        calls++;
        throw primary;
      }),
      (error: unknown) => error === primary,
    );
    expect(calls).toBe(1);
    expect(await Bun.file(path).text()).toBe("captured");
  } finally {
    await setup.close();
  }
  // Retain the failed source for recovery rather than treating cancellation as cleanup.
});

test("capture loans share all sixteen runtime operation slots with outbound transfers", async () => {
  const setup = await fixture();
  const release = Promise.withResolvers<void>();
  const work: Promise<number>[] = [];
  try {
    for (let index = 0; index < 16; index++) {
      const entered = Promise.withResolvers<void>();
      const operation = setup.files.withCapturedFile(
        { url: setup.url },
        async () => {
          entered.resolve();
          await release.promise;
          return index;
        },
      );
      work.push(operation);
      await Promise.race([entered.promise, operation]);
    }
    await assert.rejects(
      setup.files.withCapturedFile({ url: setup.url }, async () => undefined),
      /capacity exceeded/,
    );
    await assert.rejects(
      setup.files.postHttp({
        sourceFile: "/unused",
        facts: { sizeBytes: 1, sha256: "a".repeat(64) },
        url: setup.url,
        headers: {},
      }),
      /capacity exceeded/,
    );
    release.resolve();
    expect(await Promise.all(work)).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
  } finally {
    release.resolve();
    await Promise.allSettled(work);
    await setup.close();
  }
});

test("capture rejects absent provisioning and pre-abort before entering a consumer", async () => {
  const setup = await fixture(false);
  const caller = new AbortController();
  const primary = new Error("pre-aborted capture");
  caller.abort(primary);
  let calls = 0;
  const use = async (): Promise<void> => {
    calls++;
  };
  try {
    await assert.rejects(
      setup.files.withCapturedFile({ url: setup.url }, use),
      /not provisioned/,
    );
    await assert.rejects(
      setup.files.withCapturedFile({ url: setup.url }, use, {
        signal: caller.signal,
      }),
      (error: unknown) => error === primary,
    );
    expect(calls).toBe(0);
  } finally {
    await setup.close();
  }
});
