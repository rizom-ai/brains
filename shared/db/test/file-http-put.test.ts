import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileProcessOwner } from "../src/turso-worker/file-process-owner";
import {
  putFile,
  type FileHttpPutInput,
} from "../src/turso-worker/file-http-put";

interface Fixture {
  input: FileHttpPutInput;
  bytes: Buffer;
  close(): Promise<void>;
}
async function fixture(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-put-"));
  const bytes = Buffer.alloc(96 * 1024 + 7);
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = (index * 11 + Math.floor(index / (32 * 1024)) * 31) % 251;
  const sourceFile = join(directory, "source");
  await writeFile(sourceFile, bytes);
  const server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    bytes,
    input: {
      sourceFile,
      facts: {
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      url: `http://127.0.0.1:${address.port}/upload`,
      headers: {
        authorization: "Bearer fixture",
        "content-type": "application/pdf",
      },
    },
    close: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true });
    },
  };
}

test("file process owner joins the real HTTP actor and returns metadata only", async () => {
  const received = Promise.withResolvers<Buffer>();
  const setup = await fixture((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.resolve(Buffer.concat(chunks));
      response.writeHead(201).end();
    });
  });
  const actorUrl = new URL(
    "../src/turso-worker/file-http-put-process.ts",
    import.meta.url,
  );
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actorUrl,
    downloadUrl: actorUrl,
    httpUploadUrl: actorUrl,
  });
  try {
    expect(await files.put(setup.input)).toEqual({
      ...setup.input.facts,
      statusCode: 201,
    });
    expect(files.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
    expect(await received.promise).toEqual(setup.bytes);
  } finally {
    await files.close();
    await setup.close();
  }
});

test("HTTP actor cooperative cancellation exits after the owned transport retires", async () => {
  const entered = Promise.withResolvers<void>();
  const setup = await fixture((request) => {
    request.resume();
    entered.resolve();
  });
  const actorUrl = new URL(
    "../src/turso-worker/file-http-put-process.ts",
    import.meta.url,
  );
  const messages: unknown[] = [];
  const child = Bun.spawn([process.execPath, actorUrl.pathname], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    ipc: (message: unknown): void => {
      messages.push(message);
    },
  });
  try {
    child.send(setup.input);
    await Promise.race([
      entered.promise,
      child.exited.then(() => {
        throw new Error("HTTP actor exited before entering its request");
      }),
    ]);
    child.send({ kind: "cancel" });
    expect(await child.exited).toBe(1);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ kind: "failed", pid: child.pid });
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
    await setup.close();
  }
});

test("HTTP file PUT sends exact bytes and headers and returns metadata only", async () => {
  const received = Promise.withResolvers<Buffer>();
  let headers: IncomingMessage["headers"] = {};
  let method: string | undefined;
  const setup = await fixture((request, response) => {
    headers = request.headers;
    method = request.method;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.resolve(Buffer.concat(chunks));
      response.writeHead(201).end();
    });
  });
  try {
    expect(await putFile(setup.input)).toEqual({
      ...setup.input.facts,
      statusCode: 201,
    });
    expect(await received.promise).toEqual(setup.bytes);
    expect(method).toBe("PUT");
    expect(headers["authorization"]).toBe("Bearer fixture");
    expect(headers["content-length"]).toBe(String(setup.bytes.length));
    expect(headers["transfer-encoding"]).toBeUndefined();
  } finally {
    await setup.close();
  }
});

test("HTTP PUT validates size, headers and regular-file metadata before opening a request", async () => {
  let requests = 0;
  const setup = await fixture((_request, response) => {
    requests++;
    response.end();
  });
  try {
    await assert.rejects(
      putFile({
        ...setup.input,
        facts: { ...setup.input.facts, sizeBytes: 100 * 1024 * 1024 + 1 },
      }),
    );
    await assert.rejects(
      putFile({ ...setup.input, headers: { "content-length": "1" } }),
    );
    await assert.rejects(
      putFile({ ...setup.input, headers: { authorization: "a\r\nb" } }),
    );
    await assert.rejects(
      putFile({
        ...setup.input,
        facts: { ...setup.input.facts, sizeBytes: 2 },
      }),
      /declared size/,
    );
    expect(requests).toBe(0);
  } finally {
    await setup.close();
  }
});

test("HTTP PUT reports redirects and rejection statuses without replaying the file", async () => {
  for (const statusCode of [307, 403]) {
    let requests = 0;
    const setup = await fixture((request, response) => {
      requests++;
      request.resume();
      request.on("end", () =>
        response.writeHead(statusCode, { location: "/again" }).end(),
      );
    });
    try {
      expect((await putFile(setup.input)).statusCode).toBe(statusCode);
      expect(requests).toBe(1);
    } finally {
      await setup.close();
    }
  }
});

test("HTTP PUT rejects a changed digest without claiming a verified receipt", async () => {
  const setup = await fixture((request, response) => {
    request.resume();
    request.on("end", () => response.writeHead(200).end());
  });
  try {
    await assert.rejects(
      putFile({
        ...setup.input,
        facts: { ...setup.input.facts, sha256: "a".repeat(64) },
      }),
      (error: unknown) => {
        const primary = error instanceof AggregateError ? error.cause : error;
        assert.ok(primary instanceof Error);
        assert.match(primary.message, /digest mismatch/);
        return true;
      },
    );
  } finally {
    await setup.close();
  }
});

test("HTTP PUT retires an unfinished response body without buffering it", async () => {
  const setup = await fixture((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(201, { "content-length": "1000000000" });
      response.write("receipt"); // Deliberately never end the response body.
    });
  });
  try {
    expect(await putFile(setup.input)).toEqual({
      ...setup.input.facts,
      statusCode: 201,
    });
  } finally {
    await setup.close();
  }
});

test("HTTP PUT rejects premature socket closure without retry", async () => {
  let requests = 0;
  const setup = await fixture((request) => {
    requests++;
    request.socket.destroy();
  });
  try {
    await assert.rejects(putFile(setup.input), (error: unknown) => {
      const primary = error instanceof AggregateError ? error.cause : error;
      assert.ok(primary instanceof Error);
      assert.match(primary.message, /socket|closed|reset/i);
      return true;
    });
    expect(requests).toBe(1);
    expect(await Bun.file(setup.input.sourceFile).bytes()).toEqual(
      new Uint8Array(setup.bytes),
    );
  } finally {
    await setup.close();
  }
});

test("HTTP PUT pre-abort has no request and in-flight abort joins transport retirement", async () => {
  let requests = 0;
  const entered = Promise.withResolvers<void>();
  const setup = await fixture((request) => {
    requests++;
    request.resume();
    entered.resolve();
  });
  const primary = new Error("upload cancelled");
  try {
    const before = new AbortController();
    before.abort(primary);
    await assert.rejects(
      putFile(setup.input, before.signal),
      (error: unknown) => error === primary,
    );
    expect(requests).toBe(0);
    const caller = new AbortController();
    const work = putFile(setup.input, caller.signal);
    const rejected = assert.rejects(
      work,
      (error: unknown) =>
        error === primary ||
        (error instanceof AggregateError && error.cause === primary),
    );
    await entered.promise;
    caller.abort(primary);
    await rejected;
    expect(requests).toBe(1);
  } finally {
    await setup.close();
  }
});
