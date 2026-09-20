import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { FileProcessOwner } from "../src/turso-worker/file-process-owner";
import { captureFile } from "../src/turso-worker/file-capture";
import { fileFetchSchema } from "../src/turso-worker/file-fetch";

interface Peer {
  url: string;
  close(): Promise<void>;
}
async function peer(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<Peer> {
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
function owner(provision = true): FileProcessOwner {
  const actor = new URL(
    "../src/turso-worker/file-capture-process.ts",
    import.meta.url,
  );
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actor,
    downloadUrl: actor,
    ...(provision && { captureUrl: actor }),
  });
}

test("real capture actor writes arbitrary bytes without treating server MIME as inspection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "file-capture-"));
  const bytes = Buffer.from("not a PDF despite the server hint");
  let credential: string | undefined;
  const server = await peer((request, response) => {
    credential = request.headers.authorization;
    response.writeHead(200, { "content-type": "application/pdf" }).end(bytes);
  });
  const files = owner();
  const outputFile = join(directory, "captured");
  try {
    expect(
      await files.capture({
        url: server.url,
        outputFile,
        authorization: "Bearer fixture",
        maxBytes: bytes.length,
      }),
    ).toEqual({
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      details: { mediaType: "application/pdf" },
    });
    expect(credential).toBe("Bearer fixture");
    expect(await readFile(outputFile)).toEqual(bytes);
    expect(files.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
    await assert.rejects(
      files.capture({ url: server.url, outputFile }),
      /exist/i,
    );
    expect(await readFile(outputFile)).toEqual(bytes);
  } finally {
    await files.close();
    await server.close();
    await rm(directory, { recursive: true });
  }
});

test("redirects retain same-origin credentials but strip them permanently after crossing origins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "file-capture-redirect-"));
  const seen: Array<[string, string | undefined]> = [];
  let initialUrl = "";
  const other = await peer((request, response) => {
    seen.push(["other", request.headers.authorization]);
    response.writeHead(302, { location: `${initialUrl}/returned` }).end();
  });
  const initial = await peer((request, response) => {
    seen.push([request.url ?? "", request.headers.authorization]);
    if (request.url === "/")
      response.writeHead(302, { location: "/same" }).end();
    else if (request.url === "/same")
      response.writeHead(302, { location: other.url }).end();
    else response.end("bytes");
  });
  initialUrl = initial.url;
  try {
    const result = await captureFile({
      url: initial.url,
      outputFile: join(directory, "output"),
      authorization: "Bearer private",
    });
    expect(result.details.mediaType).toBe("application/octet-stream");
    expect(seen).toEqual([
      ["/", "Bearer private"],
      ["/same", "Bearer private"],
      ["other", undefined],
      ["/returned", undefined],
    ]);
  } finally {
    await initial.close();
    await other.close();
    await rm(directory, { recursive: true });
  }
});

test.each(["declared", "chunked", "decompressed"] as const)(
  "capture bounds %s bytes and retains failed staging",
  async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), "file-capture-limit-"));
    const bytes = Buffer.alloc(4096, 0x5a);
    const server = await peer((_request, response) => {
      if (kind === "declared")
        response
          .writeHead(200, { "content-length": String(bytes.length) })
          .end(bytes);
      else if (kind === "decompressed")
        response
          .writeHead(200, { "content-encoding": "gzip" })
          .end(gzipSync(bytes));
      else {
        response.writeHead(200, { "transfer-encoding": "chunked" });
        response.end(bytes);
      }
    });
    try {
      await assert.rejects(
        captureFile({
          url: server.url,
          outputFile: join(directory, "output"),
          maxBytes: 128,
        }),
        /size limit/,
      );
      await assert.rejects(readFile(join(directory, "output")), /ENOENT/);
      if (kind !== "declared")
        expect((await readdir(directory)).length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
    // Failure evidence deliberately retained.
  },
);

test("capture validates metadata before opening a socket or provisioning a fallback", async () => {
  const input = { url: "http://127.0.0.1/", outputFile: "/unused" };
  for (const invalid of [
    { ...input, authorization: "Bearer a\r\nInjected: bad" },
    { ...input, authorization: "x".repeat(4097) },
    { ...input, maxBytes: 0 },
    { ...input, maxBytes: 100 * 1024 * 1024 + 1 },
    { ...input, headers: { authorization: "hidden" } },
  ])
    expect(fileFetchSchema.safeParse(invalid).success).toBe(false);
  const files = owner(false);
  try {
    await assert.rejects(files.capture(input), /not provisioned/);
    expect(files.stats().children).toBe(0);
  } finally {
    await files.close();
  }
});

test("capture uses the existing two-child admission through shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "file-capture-capacity-"));
  const entered = Promise.withResolvers<void>();
  let count = 0;
  const server = await peer((_request, response) => {
    response.writeHead(200).write("partial");
    count++;
    if (count === 2) entered.resolve();
  });
  const files = owner();
  const work = [0, 1].map((index) =>
    files.capture({
      url: server.url,
      outputFile: join(directory, String(index)),
    }),
  );
  const observed = Promise.allSettled(work);
  try {
    await Promise.race([entered.promise, Promise.all(work)]);
    await assert.rejects(
      files.capture({ url: server.url, outputFile: join(directory, "third") }),
      /capacity exceeded/,
    );
    expect(files.stats().children).toBe(2);
    await files.close();
    expect((await observed).map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(files.stats().children).toBe(0);
    expect(count).toBe(2);
  } finally {
    await Promise.allSettled([observed, files.close()]);
    await server.close();
  }
});

test("capture cancellation holds admission until actor exit and closes its socket", async () => {
  const directory = await mkdtemp(join(tmpdir(), "file-capture-cancel-"));
  const entered = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const server = await peer((request, response) => {
    request.socket.once("close", () => closed.resolve());
    response.writeHead(200).write("partial");
    entered.resolve();
  });
  const files = owner();
  const caller = new AbortController();
  const primary = new Error("cancel capture");
  const work = files.capture(
    { url: server.url, outputFile: join(directory, "output") },
    caller.signal,
  );
  const checked = assert.rejects(
    work,
    (error: unknown) =>
      error === primary ||
      (error instanceof AggregateError && error.cause === primary),
  );
  try {
    await Promise.race([entered.promise, work]);
    expect(files.stats().children).toBe(1);
    caller.abort(primary);
    await checked;
    await closed.promise;
    expect(files.stats().children).toBe(0);
  } finally {
    caller.abort(primary);
    await Promise.allSettled([work, files.close()]);
    await server.close();
  }
  // Failed staging is retained; cancellation does not pretend to publish output.
});
