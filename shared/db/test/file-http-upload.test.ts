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
import {
  FileProcessOwner,
  ReceivedFileHttpUploadError,
} from "../src/turso-worker/file-process-owner";
import {
  putFile,
  postFile,
  fileHttpUploadRequestSchema,
  parseHttpUploadDetails,
  type FileHttpUploadInput,
} from "../src/turso-worker/file-http-upload";

test("HTTP actor requests require an explicit supported method and bounded input", () => {
  const input: FileHttpUploadInput = {
    sourceFile: "/unused",
    facts: { sizeBytes: 1, sha256: "a".repeat(64) },
    url: "http://127.0.0.1/upload",
    headers: {},
  };
  for (const method of [undefined, "GET", "DELETE", "PATCH", "post"]) {
    expect(
      fileHttpUploadRequestSchema.safeParse({ input, method }).success,
    ).toBe(false);
  }
  expect(fileHttpUploadRequestSchema.safeParse(input).success).toBe(false);
  expect(
    fileHttpUploadRequestSchema.safeParse({
      input,
      method: "POST",
      data: "payload",
    }).success,
  ).toBe(false);
  expect(
    fileHttpUploadRequestSchema.safeParse({
      input: { ...input, headers: { "transfer-encoding": "chunked" } },
      method: "POST",
    }).success,
  ).toBe(false);
});

test.each(["put", "post"] as const)(
  "HTTP %s rejects oversized request metadata before admission or source access",
  async (method) => {
    const actorUrl = new URL(
      "../src/turso-worker/file-http-upload-process.ts",
      import.meta.url,
    );
    const files = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actorUrl,
      downloadUrl: actorUrl,
      httpUploadUrl: actorUrl,
    });
    const input: FileHttpUploadInput = {
      sourceFile: "/unused",
      url: "http://127.0.0.1/upload",
      headers: {},
      facts: { sizeBytes: 1, sha256: "a".repeat(64) },
      multipart: {
        fieldName: "file",
        filename: "file.bin",
        mimeType: "application/octet-stream",
        fields: { description: "\u0000".repeat(12 * 1024) },
      },
    };
    try {
      await assert.rejects(
        files[method](input),
        /HTTP upload request exceeds its metadata limit/,
      );
      await assert.rejects(
        (method === "put" ? putFile : postFile)(input),
        /HTTP upload request exceeds its metadata limit/,
      );
      expect(files.stats()).toEqual({
        children: 0,
        terminalChildren: 0,
        fenced: false,
      });
    } finally {
      await files.close();
    }
  },
);

test("HTTP receipt bounds include escaped UTF-8 values and the full completion envelope", () => {
  const responseMetadata: NonNullable<FileHttpUploadInput["responseMetadata"]> =
    {};
  const details: Record<string, string | number> = { statusCode: 201 };
  const input: FileHttpUploadInput = {
    sourceFile: "/unused",
    url: "http://127.0.0.1/upload",
    headers: {},
    facts: { sizeBytes: 1, sha256: "a".repeat(64) },
    responseMetadata,
  };
  for (let index = 0; index < 15; index++) {
    responseMetadata[`field${index}`] = ["id"];
    details[`field${index}`] = "🔥".repeat(512);
  }
  expect(
    Object.keys(parseHttpUploadDetails(input, details).responseMetadata ?? {}),
  ).toHaveLength(15);
  for (let index = 0; index < 15; index++)
    details[`field${index}`] = "\u0000".repeat(1024);
  expect(() => parseHttpUploadDetails(input, details)).toThrow(
    "HTTP upload completion exceeds its metadata limit",
  );
  for (let index = 10; index < 15; index++) {
    delete responseMetadata[`field${index}`];
    delete details[`field${index}`];
  }
  expect(
    Object.keys(parseHttpUploadDetails(input, details).responseMetadata ?? {}),
  ).toHaveLength(10);
  responseMetadata["tail"] = ["id"];
  details["tail"] = "";
  const remaining = 64 * 1024 - Buffer.byteLength(JSON.stringify(details)) - 32;
  details["tail"] = "\u0000".repeat(Math.floor(remaining / 6));
  expect(Buffer.byteLength(JSON.stringify(details))).toBeLessThan(64 * 1024);
  expect(() => parseHttpUploadDetails(input, details)).toThrow(
    "HTTP upload completion exceeds its metadata limit",
  );
});

test.each(["put", "post"] as const)(
  "real HTTP %s actor rejects projection amplification without sending an oversized completion or replaying",
  async (method) => {
    let requests = 0;
    const setup = await fixture((request, response) => {
      requests++;
      request.resume();
      request.on("end", () =>
        response
          .writeHead(201)
          .end(JSON.stringify({ id: "\u0000".repeat(1024) })),
      );
    });
    const actorUrl = new URL(
      "../src/turso-worker/file-http-upload-process.ts",
      import.meta.url,
    );
    const files = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actorUrl,
      downloadUrl: actorUrl,
      httpUploadUrl: actorUrl,
    });
    try {
      const responseMetadata: NonNullable<
        FileHttpUploadInput["responseMetadata"]
      > = {};
      for (let index = 0; index < 10; index++)
        responseMetadata[`field${index}`] = ["id"];
      const accepted = await files[method]({
        ...setup.input,
        responseMetadata,
      });
      expect(Object.keys(accepted.responseMetadata ?? {})).toHaveLength(10);
      expect(accepted.responseMetadata?.["field9"]).toBe("\u0000".repeat(1024));
      expect(Buffer.byteLength(JSON.stringify(accepted))).toBeLessThan(
        64 * 1024,
      );
      expect(requests).toBe(1);
      for (let index = 10; index < 15; index++)
        responseMetadata[`field${index}`] = ["id"];
      await assert.rejects(
        files[method]({ ...setup.input, responseMetadata }),
        /HTTP upload completion exceeds its metadata limit/,
      );
      expect(requests).toBe(2);
      // A clean failed terminal message, not an oversized consumed message that
      // would poison the owner. The remote submission is not replayed.
      expect(files.stats()).toEqual({
        children: 0,
        terminalChildren: 0,
        fenced: false,
      });
    } finally {
      await files.close();
      await setup.close();
    }
  },
);

test.each(["put", "post"] as const)(
  "real HTTP %s retains a verified receipt through a later actor failure",
  async (method) => {
    let requests = 0;
    const setup = await fixture((request, response) => {
      requests++;
      request.resume();
      request.on("end", () =>
        response.writeHead(201).end(JSON.stringify({ id: "accepted" })),
      );
    });
    const actorUrl = new URL(
      "./fixtures/file-http-received-failure.ts",
      import.meta.url,
    );
    const files = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actorUrl,
      downloadUrl: actorUrl,
      httpUploadUrl: actorUrl,
    });
    try {
      await assert.rejects(
        files[method]({ ...setup.input, responseMetadata: { id: ["id"] } }),
        (error: unknown) => {
          assert.ok(error instanceof ReceivedFileHttpUploadError);
          assert.deepEqual(error.outcome, {
            ...setup.input.facts,
            statusCode: 201,
            responseMetadata: { id: "accepted" },
          });
          assert.ok(error.cause instanceof Error);
          assert.match(
            error.cause.message,
            /injected receipt observer failure/,
          );
          return true;
        },
      );
      expect(requests).toBe(1);
      expect(files.stats().children).toBe(0);
    } finally {
      await files.close();
      await setup.close();
    }
  },
);

test("real multipart actor streams the file and returns only selected bounded receipt fields", async () => {
  const received = Promise.withResolvers<{
    bytes: Buffer;
    contentType: string;
    length: string | undefined;
  }>();
  const setup = await fixture((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.resolve({
        bytes: Buffer.concat(chunks),
        contentType: request.headers["content-type"] ?? "",
        length: request.headers["content-length"],
      });
      response.end(
        JSON.stringify({
          id: "123",
          channel_id: "456",
          attachments: [{ id: "789", size: setup.bytes.length }],
          content: "not returned to the owner",
        }),
      );
    });
  });
  const actorUrl = new URL(
    "../src/turso-worker/file-http-upload-process.ts",
    import.meta.url,
  );
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actorUrl,
    downloadUrl: actorUrl,
    httpUploadUrl: actorUrl,
  });
  try {
    const result = await files.post({
      ...setup.input,
      headers: { authorization: "Bot fixture" },
      multipart: {
        fieldName: "files[0]",
        filename: "résumé.png",
        mimeType: "image/png",
        fields: {
          payload_json: JSON.stringify({
            attachments: [{ id: 0, filename: "résumé.png" }],
          }),
        },
      },
      responseMetadata: {
        messageId: ["id"],
        channelId: ["channel_id"],
        attachmentCount: ["attachments", "length"],
        attachmentSize: ["attachments", 0, "size"],
      },
    });
    expect(result).toEqual({
      ...setup.input.facts,
      statusCode: 200,
      responseMetadata: {
        messageId: "123",
        channelId: "456",
        attachmentCount: 1,
        attachmentSize: setup.bytes.length,
      },
    });
    const wire = await received.promise;
    expect(wire.length).toBe(String(wire.bytes.length));
    const form = await new Request("http://fixture", {
      method: "POST",
      body: new Uint8Array(wire.bytes),
      headers: { "content-type": wire.contentType },
    }).formData();
    expect(form.get("payload_json")).toBe(
      JSON.stringify({ attachments: [{ id: 0, filename: "résumé.png" }] }),
    );
    const file = form.get("files[0]");
    assert.ok(file instanceof File);
    expect(file.name).toBe("résumé.png");
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array(setup.bytes),
    );
    expect(files.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
  } finally {
    await files.close();
    await setup.close();
  }
});

test.each([
  "oversized",
  "declared-oversized",
  "invalid-utf8",
  "invalid-json",
  "missing",
  "nonscalar",
  "long-scalar",
] as const)("selected HTTP JSON rejects %s without replay", async (kind) => {
  let requests = 0;
  const setup = await fixture((request, response) => {
    requests++;
    request.resume();
    request.on("end", () => {
      if (kind === "declared-oversized")
        response.writeHead(200, { "content-length": "65537" }).end();
      else if (kind === "oversized") {
        response.writeHead(200, { "transfer-encoding": "chunked" });
        response.end("x".repeat(65537));
      } else if (kind === "invalid-utf8") response.end(Buffer.from([0xff]));
      else if (kind === "invalid-json") response.end("not JSON");
      else if (kind === "missing") response.end("{}");
      else if (kind === "nonscalar") response.end('{"id":{}}');
      else response.end(JSON.stringify({ id: "x".repeat(1025) }));
    });
  });
  try {
    await assert.rejects(
      postFile({ ...setup.input, responseMetadata: { id: ["id"] } }),
      (error: unknown) => {
        const primary: unknown =
          error instanceof AggregateError ? error.cause : error;
        assert.ok(primary instanceof Error);
        if (kind === "oversized" || kind === "declared-oversized")
          expect(primary.message).toBe(
            "HTTP metadata response exceeds its byte limit",
          );
        else if (kind === "invalid-utf8")
          expect(primary.name).toBe("TypeError");
        else if (kind === "invalid-json")
          expect(primary.name).toBe("SyntaxError");
        else if (kind === "missing")
          expect(primary.message).toBe(
            "HTTP metadata response is missing a selected field",
          );
        else expect(primary.name).toBe("ZodError");
        return true;
      },
    );
    expect(requests).toBe(1);
  } finally {
    await setup.close();
  }
});

test("real metadata response cancellation joins socket retirement and actual actor exit", async () => {
  const entered = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const setup = await fixture((request, response) => {
    request.socket.once("close", () => closed.resolve());
    request.resume();
    request.on("end", () => {
      response.writeHead(200).write('{"id":');
      entered.resolve();
    });
  });
  const actorUrl = new URL(
    "../src/turso-worker/file-http-upload-process.ts",
    import.meta.url,
  );
  const files = new FileProcessOwner({
    executable: process.execPath,
    uploadUrl: actorUrl,
    downloadUrl: actorUrl,
    httpUploadUrl: actorUrl,
  });
  const caller = new AbortController();
  const primary = new Error("cancel metadata wait");
  const work = files.post(
    { ...setup.input, responseMetadata: { id: ["id"] } },
    caller.signal,
  );
  const rejected = assert.rejects(
    work,
    (error: unknown) =>
      error === primary ||
      (error instanceof AggregateError && error.cause === primary),
  );
  try {
    await Promise.race([entered.promise, work]);
    caller.abort(primary);
    await rejected;
    await closed.promise;
    expect(files.stats()).toEqual({
      children: 0,
      terminalChildren: 0,
      fenced: false,
    });
  } finally {
    caller.abort(primary);
    await Promise.allSettled([work, files.close()]);
    await setup.close();
  }
});

test("selected JSON error statuses are returned without reading a response body or following redirects", async () => {
  let requests = 0;
  const setup = await fixture((request, response) => {
    requests++;
    request.resume();
    request.on("end", () =>
      response
        .writeHead(307, { location: "/replay", "content-length": "9999999" })
        .end(),
    );
  });
  try {
    expect(
      await postFile({ ...setup.input, responseMetadata: { id: ["id"] } }),
    ).toEqual({ ...setup.input.facts, statusCode: 307 });
    expect(requests).toBe(1);
  } finally {
    await setup.close();
  }
});

test("multipart and receipt metadata cannot override framing or exceed the existing scalar envelope", () => {
  const input = {
    sourceFile: "/unused",
    facts: { sizeBytes: 1, sha256: "a".repeat(64) },
    url: "http://127.0.0.1/upload",
    headers: {},
  };
  const multipart = {
    fieldName: "files[0]",
    filename: "source.png",
    mimeType: "image/png",
    fields: {},
  };
  const invalid: unknown[] = [
    { ...input, multipart, headers: { "Content-Type": "malicious" } },
    { ...input, multipart: { ...multipart, filename: "x\r\nInjected: bad" } },
    { ...input, multipart: { ...multipart, fieldName: 'x"' } },
    {
      ...input,
      multipart: { ...multipart, fields: { "files[0]": "collision" } },
    },
    {
      ...input,
      multipart: { ...multipart, fields: { data: "x".repeat(16385) } },
    },
    { ...input, responseMetadata: { statusCode: ["id"] } },
    { ...input, responseMetadata: { id: ["constructor"] } },
    {
      ...input,
      responseMetadata: { id: Array.from({ length: 9 }, () => "nested") },
    },
    { ...input, responseMetadata: { id: [-1] } },
    {
      ...input,
      responseMetadata: Object.fromEntries(
        Array.from({ length: 16 }, (_, index) => [`field${index}`, ["id"]]),
      ),
    },
  ];
  for (const value of invalid)
    expect(
      fileHttpUploadRequestSchema.safeParse({ method: "POST", input: value })
        .success,
    ).toBe(false);
  expect(
    fileHttpUploadRequestSchema.safeParse({
      method: "POST",
      input: { ...input, multipart, responseMetadata: { id: ["id"] } },
    }).success,
  ).toBe(true);
});

interface Fixture {
  input: FileHttpUploadInput;
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

test.each(["put", "post"] as const)(
  "file process owner joins the real HTTP %s actor and returns metadata only",
  async (method) => {
    let receivedMethod: string | undefined;
    const received = Promise.withResolvers<Buffer>();
    const setup = await fixture((request, response) => {
      receivedMethod = request.method;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.resolve(Buffer.concat(chunks));
        response.writeHead(201).end();
      });
    });
    const actorUrl = new URL(
      "../src/turso-worker/file-http-upload-process.ts",
      import.meta.url,
    );
    const files = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actorUrl,
      downloadUrl: actorUrl,
      httpUploadUrl: actorUrl,
    });
    try {
      expect(await files[method](setup.input)).toEqual({
        ...setup.input.facts,
        statusCode: 201,
      });
      expect(files.stats()).toEqual({
        children: 0,
        terminalChildren: 0,
        fenced: false,
      });
      expect(await received.promise).toEqual(setup.bytes);
      expect(receivedMethod).toBe(method.toUpperCase());
    } finally {
      await files.close();
      await setup.close();
    }
  },
);

test.each(["PUT", "POST"] as const)(
  "HTTP %s actor cooperative cancellation exits after the owned transport retires",
  async (method) => {
    const entered = Promise.withResolvers<void>();
    const setup = await fixture((request) => {
      request.resume();
      entered.resolve();
    });
    const actorUrl = new URL(
      "../src/turso-worker/file-http-upload-process.ts",
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
      child.send({ input: setup.input, method });
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
  },
);

test.each(["PUT", "POST"] as const)(
  "HTTP file %s sends exact bytes and headers and returns metadata only",
  async (operation) => {
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
      expect(
        await (operation === "PUT" ? putFile : postFile)(setup.input),
      ).toEqual({
        ...setup.input.facts,
        statusCode: 201,
      });
      expect(await received.promise).toEqual(setup.bytes);
      expect(method).toBe(operation);
      expect(headers["authorization"]).toBe("Bearer fixture");
      expect(headers["content-length"]).toBe(String(setup.bytes.length));
      expect(headers["transfer-encoding"]).toBeUndefined();
    } finally {
      await setup.close();
    }
  },
);

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

test.each(["PUT", "POST"] as const)(
  "HTTP %s reports redirects and rejection statuses without replaying the file",
  async (method) => {
    const send = method === "PUT" ? putFile : postFile;
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
        expect((await send(setup.input)).statusCode).toBe(statusCode);
        expect(requests).toBe(1);
      } finally {
        await setup.close();
      }
    }
  },
);

test.each(["PUT", "POST"] as const)(
  "HTTP %s rejects a changed digest without claiming a verified receipt",
  async (method) => {
    const send = method === "PUT" ? putFile : postFile;
    const setup = await fixture((request, response) => {
      request.resume();
      request.on("end", () => response.writeHead(200).end());
    });
    try {
      await assert.rejects(
        send({
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
  },
);

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
