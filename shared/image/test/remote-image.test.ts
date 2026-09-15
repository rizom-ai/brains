import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { FileProcessOwner } from "@brains/db/file-process-owner";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
function owner(): FileProcessOwner {
  return new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: new URL(
      "../../db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    downloadUrl: new URL(
      "../../db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
    remoteDownloadUrl: new URL(
      "../src/remote-image-process.ts",
      import.meta.url,
    ),
  });
}
test("owned URL actor follows redirects, decompresses and verifies image facts before no-replace output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-image-"));
  const actors = owner();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response => {
      if (new URL(request.url).pathname === "/redirect")
        return new Response(null, {
          status: 302,
          headers: { location: "/image" },
        });
      return new Response(gzipSync(png), {
        headers: { "content-type": "image/png", "content-encoding": "gzip" },
      });
    },
  });
  try {
    const input = {
      url: `http://127.0.0.1:${server.port}/redirect`,
      outputFile: join(directory, "image"),
    };
    const facts = await actors.fetch(input);
    expect(facts.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect(facts.sizeBytes).toBe(png.length);
    expect(facts.details["width"]).toBe(1);
    expect(await readFile(input.outputFile)).toEqual(png);
    await assert.rejects(actors.fetch(input), /EEXIST/);
    expect(await readFile(input.outputFile)).toEqual(png);
    expect(actors.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
  } finally {
    await actors.close();
    await server.stop(true);
  }
});
test("signature mismatch retains staging and never publishes; actor admission remains reusable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-mismatch-"));
  const actors = owner();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start: (controller): void => {
            controller.enqueue(png);
            controller.close();
          },
        }),
        {
          headers: {
            "transfer-encoding": "chunked",
            "content-type":
              new URL(request.url).pathname === "/bad"
                ? "image/jpeg"
                : "image/png",
          },
        },
      ),
  });
  try {
    const outputFile = join(directory, "image");
    await assert.rejects(
      actors.fetch({ url: `http://127.0.0.1:${server.port}/bad`, outputFile }),
      /does not match/,
    );
    expect(await Bun.file(outputFile).exists()).toBe(false);
    expect(
      (await readdir(directory)).some((name) => name.endsWith(".partial")),
    ).toBe(true);
    await actors.fetch({
      url: `http://127.0.0.1:${server.port}/good`,
      outputFile,
    });
    expect(await readFile(outputFile)).toEqual(png);
  } finally {
    await actors.close();
    await server.stop(true);
  }
});
test("oversized declarations and truncated compressed responses cannot publish", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-bounds-"));
  const actors = owner();
  const server = createServer((request, response) => {
    if (request.url === "/oversized") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(100 * 1024 * 1024 + 1),
      });
      response.end("x");
    } else {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-encoding": "gzip",
      });
      response.end(gzipSync(png).subarray(0, 12));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const route of ["oversized", "truncated"]) {
      const outputFile = join(directory, route);
      const download = actors.fetch({
        url: `http://127.0.0.1:${address.port}/${route}`,
        outputFile,
      });
      if (route === "oversized") await assert.rejects(download, /size limit/);
      else await assert.rejects(download);
      expect(await Bun.file(outputFile).exists()).toBe(false);
      expect(actors.stats().children).toBe(0);
    }
  } finally {
    await actors.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("caller cancellation joins the active HTTP actor before releasing admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-cancel-"));
  const actors = owner();
  const entered = Promise.withResolvers<void>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (): Response => {
      entered.resolve();
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (controller): void => controller.enqueue(png),
        }),
        { headers: { "content-type": "image/png" } },
      );
    },
  });
  const caller = new AbortController();
  const primary = new Error("HTTP ingress cancelled");
  try {
    const running = actors.fetch(
      {
        url: `http://127.0.0.1:${server.port}/held`,
        outputFile: join(directory, "image"),
      },
      caller.signal,
    );
    const rejected = assert.rejects(
      running,
      (error: unknown) => error === primary,
    );
    await entered.promise;
    expect(actors.stats().children).toBe(1);
    caller.abort(primary);
    await rejected;
    expect(actors.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
    expect(await Bun.file(join(directory, "image")).exists()).toBe(false);
  } finally {
    caller.abort(primary);
    await actors.close();
    await server.stop(true);
  }
});
