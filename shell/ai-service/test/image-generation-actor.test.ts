import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import { createImageGenerationRequest } from "../src/image-generation-request";

async function peer(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
function owner(): FileProcessOwner {
  const actor = new URL(
    "./fixtures/image-generation-actor.ts",
    import.meta.url,
  );
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actor,
    downloadUrl: actor,
    producerUrl: actor,
    producerUrls: { "ai-image": actor },
  });
}

test.each(["openai:gpt-image-1.5", "google:imagen-4.0-generate-001"])(
  "%s SDK bytes stay in the named actor until sealed file handoff",
  async (model) => {
    const directory = await mkdtemp(join(tmpdir(), "ai-actor-success-"));
    const bytes = Buffer.alloc(128 * 1024 + 3, 0x5a);
    let requests = 0;
    let pid = 0;
    const server = await peer((request, response) => {
      requests++;
      pid = Number(request.headers["x-fixture-pid"]);
      expect(pid).not.toBe(process.pid);
      const encoded = bytes.toString("base64");
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(
          JSON.stringify(
            model.startsWith("google:")
              ? { predictions: [{ bytesBase64Encoded: encoded }] }
              : { created: 1, data: [{ b64_json: encoded }] },
          ),
        );
    });
    const files = owner();
    const outputFile = join(directory, "image");
    try {
      const facts = await files.produce(
        {
          sourceDirectory: directory,
          outputFile,
          metadata: {
            ...createImageGenerationRequest("prompt", {
              imageModel: model,
              imageApiKey: server.url,
            }),
          },
        },
        undefined,
        "ai-image",
      );
      expect(facts).toEqual({
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(await readFile(outputFile)).toEqual(bytes);
      expect(requests).toBe(1);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      expect(files.stats().children).toBe(0);
      await rm(directory, { recursive: true });
    } finally {
      await files.close();
      await server.close();
    }
  },
);

test("SDK image faults are single-attempt, retain staging and never fall back to a different producer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-actor-failure-"));
  let requests = 0;
  let pid = 0;
  const server = await peer((request, response) => {
    requests++;
    pid = Number(request.headers["x-fixture-pid"]);
    response.writeHead(500, { "content-type": "application/json" }).end(
      JSON.stringify({
        error: { message: "fixture provider failure", type: "server_error" },
      }),
    );
  });
  const files = owner();
  const input = {
    sourceDirectory: directory,
    outputFile: join(directory, "image"),
    metadata: {
      ...createImageGenerationRequest("prompt", { imageApiKey: server.url }),
    },
  };
  try {
    await assert.rejects(
      files.produce(input, undefined, "missing"),
      /not provisioned/,
    );
    expect(requests).toBe(0);
    await assert.rejects(
      files.produce(input, undefined, "ai-image"),
      /fixture provider failure/,
    );
    expect(requests).toBe(1);
    expect(pid).not.toBe(process.pid);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    expect(await Bun.file(input.outputFile).exists()).toBe(false);
    expect(
      (await readdir(directory)).some((name) => name.endsWith(".partial")),
    ).toBe(true);
    expect(files.stats().children).toBe(0);
  } finally {
    await files.close();
    await server.close();
  }
});

test("named SDK generation shares one bulk slot and cancellation joins its native socket and actual exit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-actor-cancel-"));
  const entered = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  let requests = 0;
  let pid = 0;
  const server = await peer((request, response) => {
    requests++;
    pid = Number(request.headers["x-fixture-pid"]);
    request.socket.once("close", () => closed.resolve());
    response.writeHead(200, { "content-type": "application/json" });
    response.write("{");
    entered.resolve();
  });
  const files = owner();
  const caller = new AbortController();
  const input = {
    sourceDirectory: directory,
    outputFile: join(directory, "image"),
    metadata: {
      ...createImageGenerationRequest("prompt", { imageApiKey: server.url }),
    },
  };
  const work = files.produce(input, caller.signal, "ai-image");
  const rejected = assert.rejects(work);
  try {
    await Promise.race([entered.promise, work]);
    await assert.rejects(
      files.produce({ ...input, outputFile: join(directory, "other") }),
      /production capacity/,
    );
    expect(files.stats().children).toBe(1);
    caller.abort(new Error("cancel inference; remote outcome may be unknown"));
    await rejected;
    await closed.promise;
    expect(requests).toBe(1);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    expect(files.stats().children).toBe(0);
    expect(await Bun.file(input.outputFile).exists()).toBe(false);
  } finally {
    caller.abort();
    await Promise.allSettled([work, rejected]);
    await files.close();
    await server.close();
  }
});
