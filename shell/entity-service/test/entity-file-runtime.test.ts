import { expect, test, spyOn } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import {
  EntityFileRuntime,
  type EntityFileReader,
} from "../src/entity-file-runtime";
import { EntityBinaryClient } from "../src/entity-binary-client";
import {
  parseEntityBinaryControlRequest,
  type EntityBinaryControlRequest,
} from "../src/entity-binary-rpc";
const ticket = "00000000-0000-4000-8000-000000000001";
const input = { sourceFile: "/trusted/image.png", sizeBytes: 1 };
function runtime(
  control: (request: EntityBinaryControlRequest) => Promise<unknown>,
  invalidate: () => void = (): void => {
    throw new Error("Unexpected fence");
  },
): EntityFileRuntime {
  const client = new EntityBinaryClient({
    transport: {
      control: (request, options): Promise<unknown> => {
        expect(options?.signal).toBeUndefined();
        return control(parseEntityBinaryControlRequest(request));
      },
      publication: async (): Promise<never> => {
        throw new Error("Unexpected publication");
      },
      invalidate,
    },
  });
  return new EntityFileRuntime(client, {
    producerUrl: new URL(
      "../../../shared/db/test/fixtures/file-process-peer.ts",
      import.meta.url,
    ),
    executable: process.execPath,
    uploadUrl: new URL(
      "../../../shared/db/src/turso-worker/file-upload-process.ts",
      import.meta.url,
    ),
    downloadUrl: new URL(
      "../../../shared/db/src/turso-worker/file-download-process.ts",
      import.meta.url,
    ),
    inspectionUploadUrl: new URL(
      "../../../shared/image/src/file-inspection-process.ts",
      import.meta.url,
    ),
  });
}
test.each(["put", "post"] as const)(
  "HTTP %s keeps its borrowed file alive through shutdown and acknowledged retirement",
  async (actor) => {
    const operation = actor === "put" ? "putHttp" : "postHttp";
    const files = runtime(async (): Promise<never> => {
      throw new Error("Unexpected native control");
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let path = "";
    const download = spyOn(
      EntityBinaryClient.prototype,
      "downloadFile",
    ).mockImplementation(async (request) => {
      path = request.outputFile;
      await Bun.write(path, "fixture");
      return { sizeBytes: 7, sha256: "a".repeat(64) };
    });
    const put = spyOn(FileProcessOwner.prototype, actor).mockImplementation(
      async (request, signal) => {
        expect(request.sourceFile).toBe(path);
        entered.resolve();
        await release.promise;
        expect(signal?.aborted).toBe(true);
        expect(await Bun.file(path).exists()).toBe(true);
        return { ...request.facts, statusCode: 201 };
      },
    );
    const work = files.withAssetFile(
      `asset://sha256/${"a".repeat(64)}`,
      async (file, signal) =>
        files[operation](
          {
            sourceFile: file.sourceFile,
            facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
            url: "http://127.0.0.1/upload",
            headers: {},
          },
          { signal },
        ),
    );
    try {
      await entered.promise;
      let closed = false;
      const closing = files.close().then(() => {
        closed = true;
      });
      await assert.rejects(
        files[operation]({
          sourceFile: path,
          facts: { sizeBytes: 7, sha256: "a".repeat(64) },
          url: "http://127.0.0.1/upload",
          headers: {},
        }),
        /closing/,
      );
      expect(closed).toBe(false);
      expect(await Bun.file(path).exists()).toBe(true);
      release.resolve();
      expect((await work).statusCode).toBe(201);
      await closing;
      expect(await Bun.file(path).exists()).toBe(false);
      expect(put).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await Promise.allSettled([work, files.close()]);
      put.mockRestore();
      download.mockRestore();
    }
  },
);

test.each(["put", "post"] as const)(
  "failed HTTP %s preserves its cause graph and retains the borrowed source without replay",
  async (actor) => {
    const operation = actor === "put" ? "putHttp" : "postHttp";
    const files = runtime(async (): Promise<never> => {
      throw new Error("Unexpected native control");
    });
    const primary = new Error("remote outcome uncertain");
    const cleanup = new Error("actor retirement failed");
    const failure = new AggregateError(
      [primary, cleanup],
      "HTTP upload failed",
      {
        cause: primary,
      },
    );
    let path = "";
    const download = spyOn(
      EntityBinaryClient.prototype,
      "downloadFile",
    ).mockImplementation(async (request) => {
      path = request.outputFile;
      await Bun.write(path, "fixture");
      return { sizeBytes: 7, sha256: "a".repeat(64) };
    });
    const put = spyOn(FileProcessOwner.prototype, actor).mockRejectedValue(
      failure,
    );
    try {
      await assert.rejects(
        files.withAssetFile(
          `asset://sha256/${"a".repeat(64)}`,
          async (file, signal) =>
            files[operation](
              {
                sourceFile: file.sourceFile,
                facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
                url: "http://127.0.0.1/upload",
                headers: {},
              },
              { signal },
            ),
        ),
        (error: unknown) => error === failure,
      );
      expect(await Bun.file(path).exists()).toBe(true);
      expect(put).toHaveBeenCalledTimes(1);
    } finally {
      await files.close();
      put.mockRestore();
      download.mockRestore();
    }
  },
);

test.each(["putHttp", "postHttp"] as const)(
  "HTTP %s rejects pre-abort and missing provisioning without native authority",
  async (operation) => {
    let calls = 0;
    const files = runtime(async (): Promise<never> => {
      calls++;
      throw new Error("Unexpected native control");
    });
    const request = {
      sourceFile: "/unused",
      facts: { sizeBytes: 1, sha256: "a".repeat(64) },
      url: "http://127.0.0.1/upload",
      headers: {},
    };
    const abort = new AbortController();
    const primary = new Error("pre-abort");
    abort.abort(primary);
    try {
      await assert.rejects(
        files[operation](request, { signal: abort.signal }),
        (error: unknown) => error === primary,
      );
      await assert.rejects(files[operation](request), /not provisioned/);
      expect(calls).toBe(0);
    } finally {
      await files.close();
    }
  },
);

test("read-only asset loans retain failures and join borrowers during owner shutdown", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const reader: EntityFileReader = files;
  const ref = `asset://sha256/${"a".repeat(64)}` as const;
  const download = spyOn(
    EntityBinaryClient.prototype,
    "downloadFile",
  ).mockImplementation(async (request) => {
    await Bun.write(request.outputFile, "fixture");
    return { sizeBytes: 7, sha256: "a".repeat(64) };
  });
  const primary = new Error("consumer failed");
  let failedFile = "";
  let successfulFile = "";
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    await assert.rejects(
      reader.withAssetFile(ref, async (file): Promise<never> => {
        failedFile = file.sourceFile;
        expect(file.sizeBytes).toBe(7);
        expect(file.sha256).toBe("a".repeat(64));
        throw primary;
      }),
      (error: unknown) => error === primary,
    );
    expect(await Bun.file(failedFile).exists()).toBe(true);
    const work = reader.withAssetFile(ref, async (file, signal) => {
      successfulFile = file.sourceFile;
      entered.resolve();
      await release.promise;
      expect(signal.aborted).toBe(true);
      expect(await Bun.file(successfulFile).exists()).toBe(true);
      return "acknowledged";
    });
    await entered.promise;
    let closed = false;
    const closing = files.close().then(() => {
      closed = true;
    });
    await assert.rejects(
      reader.withAssetFile(ref, async () => "unexpected"),
      /closing/,
    );
    expect(closed).toBe(false);
    release.resolve();
    expect(await work).toBe("acknowledged");
    await closing;
    expect(await Bun.file(successfulFile).exists()).toBe(false);
    expect(await Bun.file(failedFile).exists()).toBe(true);
    expect(download).toHaveBeenCalledTimes(2);
  } finally {
    release.resolve();
    await files.close();
    download.mockRestore();
  }
});

test("cancelled asset downloads join their receipt without admitting a consumer", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const primary = new Error("cancelled during download");
  let retained = "";
  let consumed = false;
  const download = spyOn(
    EntityBinaryClient.prototype,
    "downloadFile",
  ).mockImplementation(async (request) => {
    retained = request.outputFile;
    await Bun.write(retained, "fixture");
    entered.resolve();
    await release.promise;
    return { sizeBytes: 7, sha256: "a".repeat(64) };
  });
  try {
    const work = files.withAssetFile(
      `asset://sha256/${"a".repeat(64)}`,
      async () => {
        consumed = true;
      },
      { signal: caller.signal },
    );
    const rejected = assert.rejects(
      work,
      (error: unknown) => error === primary,
    );
    await entered.promise;
    caller.abort(primary);
    expect(consumed).toBe(false);
    let closed = false;
    const closing = files.close().finally(() => {
      closed = true;
    });
    const retired = assert.rejects(
      closing,
      (error: unknown) =>
        error instanceof AggregateError && error.cause === primary,
    );
    expect(closed).toBe(false);
    release.resolve();
    await rejected;
    await retired;
    expect(consumed).toBe(false);
    expect(await Bun.file(retained).exists()).toBe(true);
  } finally {
    release.resolve();
    await assert.rejects(
      files.close(),
      (error: unknown) =>
        error instanceof AggregateError && error.cause === primary,
    );
    download.mockRestore();
  }
});

test("asset loans preserve native failure graphs and never lend unacknowledged files", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const primary = new Error("download failed");
  const cleanup = new Error("retirement uncertain");
  const failure = new AggregateError(
    [primary, cleanup],
    "Download and retirement failed",
    { cause: primary },
  );
  let retained = "";
  let consumed = false;
  const download = spyOn(
    EntityBinaryClient.prototype,
    "downloadFile",
  ).mockImplementation(async (request) => {
    retained = request.outputFile;
    await Bun.write(retained, "fixture");
    throw failure;
  });
  try {
    await assert.rejects(
      files.withAssetFile(`asset://sha256/${"a".repeat(64)}`, async () => {
        consumed = true;
      }),
      (error: unknown) => error === failure,
    );
    expect(consumed).toBe(false);
    expect(await Bun.file(retained).exists()).toBe(true);
  } finally {
    await files.close();
    download.mockRestore();
  }
});

test("borrowed assets hold the existing sixteen operation slots until consumers settle", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const release = Promise.withResolvers<void>();
  const work: Promise<void>[] = [];
  const download = spyOn(
    EntityBinaryClient.prototype,
    "downloadFile",
  ).mockImplementation(async (request) => {
    await Bun.write(request.outputFile, "fixture");
    return { sizeBytes: 7, sha256: "a".repeat(64) };
  });
  try {
    for (let index = 0; index < 16; index++) {
      const entered = Promise.withResolvers<void>();
      work.push(
        files.withAssetFile(`asset://sha256/${"a".repeat(64)}`, async () => {
          entered.resolve();
          await release.promise;
        }),
      );
      await entered.promise;
    }
    await assert.rejects(
      files.withAssetFile(
        `asset://sha256/${"a".repeat(64)}`,
        async () => "unexpected",
      ),
      /admission capacity/,
    );
    for (const operation of ["putHttp", "postHttp"] as const) {
      await assert.rejects(
        files[operation]({
          sourceFile: "/unused",
          facts: { sizeBytes: 1, sha256: "a".repeat(64) },
          url: "http://127.0.0.1/upload",
          headers: {},
        }),
        /admission capacity/,
      );
    }
    expect(download).toHaveBeenCalledTimes(16);
  } finally {
    release.resolve();
    await Promise.all(work);
    await files.close();
    download.mockRestore();
  }
});

test("asset file loans reject invalid references and pre-aborts before downloading", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const download = spyOn(EntityBinaryClient.prototype, "downloadFile");
  const abort = new AbortController();
  const primary = new Error("cancelled");
  abort.abort(primary);
  try {
    await assert.rejects(
      files.withAssetFile("asset://sha256/invalid", async () => "unexpected"),
      /asset reference/,
    );
    await assert.rejects(
      files.withAssetFile(
        `asset://sha256/${"a".repeat(64)}`,
        async () => "unexpected",
        { signal: abort.signal },
      ),
      (error: unknown) => error === primary,
    );
    expect(download).not.toHaveBeenCalled();
  } finally {
    await files.close();
    download.mockRestore();
  }
});

test("unknown inspection selections never acquire native authority or fall back", async () => {
  let calls = 0;
  const files = runtime(async (): Promise<never> => {
    calls++;
    throw new Error("Unexpected control");
  });
  try {
    await assert.rejects(
      files.inspect(input, { inspector: "pdf" }),
      /not provisioned/,
    );
    await assert.rejects(files.inspect(input, { inspector: "bad/name" }));
    expect(calls).toBe(0);
  } finally {
    await files.close();
  }
});

test("file inspection validates trusted paths and sizes before acquiring authority", async () => {
  let calls = 0;
  const files = runtime(async (): Promise<never> => {
    calls++;
    throw new Error("Unexpected control");
  });
  try {
    await assert.rejects(
      files.inspect({ ...input, sourceFile: "relative.png" }),
    );
    await assert.rejects(
      files.inspect({ ...input, sourceFile: "/invalid\0.png" }),
    );
    await assert.rejects(
      files.inspect({ ...input, sizeBytes: 100 * 1024 * 1024 + 1 }),
    );
    expect(calls).toBe(0);
  } finally {
    await files.close();
  }
});
test("caller cancellation rejects every file operation before native admission", async () => {
  let calls = 0;
  const files = runtime(async (): Promise<never> => {
    calls++;
    throw new Error("Unexpected admission");
  });
  const abort = new AbortController();
  const primary = new Error("job cancelled");
  abort.abort(primary);
  const options = { signal: abort.signal };
  try {
    await assert.rejects(
      files.withProducedFile(
        "/unused",
        async (): Promise<never> => {
          throw new Error("Unexpected consumer");
        },
        options,
      ),
      (error: unknown) => error === primary,
    );
    await assert.rejects(
      files.inspect(input, options),
      (error: unknown) => error === primary,
    );
    await assert.rejects(
      files.fingerprint(input, options),
      (error: unknown) => error === primary,
    );
    await assert.rejects(
      files.download(
        {
          ref: `asset://sha256/${"a".repeat(64)}`,
          outputFile: "/trusted/output",
        },
        options,
      ),
      (error: unknown) => error === primary,
    );
    await assert.rejects(
      files.publish(
        {
          ...input,
          publication: {
            operation: "createEntity",
            request: {
              entity: {
                id: "image",
                entityType: "image",
                content: `asset://sha256/${"a".repeat(64)}`,
                metadata: {},
              },
            },
          },
        },
        options,
      ),
      (error: unknown) => error === primary,
    );
    expect(calls).toBe(0);
  } finally {
    await files.close();
  }
});

test("produced files stay borrowed through consumption, retain failures and preserve late acknowledged results", async () => {
  const root = await mkdtemp(join(tmpdir(), "produced-runtime-"));
  const sourceDirectory = join(root, "source");
  await mkdir(sourceDirectory);
  await Bun.write(`${sourceDirectory}.exit`, "release actor");
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected native request");
  });
  const primary = new Error("consumer failed");
  let failedFile = "";
  try {
    await assert.rejects(
      files.withProducedFile(sourceDirectory, async (file): Promise<never> => {
        failedFile = file.sourceFile;
        expect(
          new Uint8Array(await Bun.file(failedFile).arrayBuffer()),
        ).toEqual(new Uint8Array([7, 8, 9]));
        throw primary;
      }),
      (error: unknown) => error === primary,
    );
    expect(await Bun.file(failedFile).exists()).toBe(true);
    const caller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let successfulFile = "";
    const work = files.withProducedFile(
      sourceDirectory,
      async (file, signal): Promise<string> => {
        successfulFile = file.sourceFile;
        entered.resolve();
        await release.promise;
        expect(signal.aborted).toBe(true);
        return "publication acknowledged";
      },
      { signal: caller.signal },
    );
    try {
      await entered.promise;
      caller.abort(new Error("late cancellation"));
      expect(await Bun.file(successfulFile).exists()).toBe(true);
    } finally {
      release.resolve();
    }
    expect(await work).toBe("publication acknowledged");
    expect(await Bun.file(successfulFile).exists()).toBe(false);
  } finally {
    await files.close();
    await rm(root, { recursive: true });
  }
});

test("remote file callback owns the pin through cancellation and retains interrupted output", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const primary = new Error("remote callback cancelled");
  let pin = "";
  const fetch = spyOn(FileProcessOwner.prototype, "fetch").mockImplementation(
    async ({ outputFile }) => {
      await Bun.write(outputFile, "spooled");
      return { sizeBytes: 7, sha256: "a".repeat(64), details: {} };
    },
  );
  const files = runtime(async (): Promise<never> => {
    throw new Error("No native admission before the callback");
  });
  const work = files.withRemoteFile(
    "http://127.0.0.1/image",
    async (file, signal): Promise<void> => {
      pin = file.sourceFile;
      entered.resolve();
      await release.promise;
      signal.throwIfAborted();
    },
    { signal: caller.signal },
  );
  const rejected = assert.rejects(work, (error: unknown) => error === primary);
  try {
    await entered.promise;
    caller.abort(primary);
    expect(await Bun.file(pin).text()).toBe("spooled");
    release.resolve();
    await rejected;
    expect(await Bun.file(pin).text()).toBe("spooled");
    let completed = "";
    expect(
      await files.withRemoteFile(
        "http://127.0.0.1/image",
        async (file): Promise<string> => {
          completed = file.sourceFile;
          return "accepted";
        },
      ),
    ).toBe("accepted");
    expect(await Bun.file(completed).exists()).toBe(false);
  } finally {
    release.resolve();
    await rejected;
    await files.close();
    fetch.mockRestore();
  }
});

test("file runtime closes admission before asynchronous shutdown", async () => {
  const files = runtime(async (): Promise<never> => {
    throw new Error("Unexpected control");
  });
  const closing = files.close();
  await assert.rejects(files.inspect(input), /closing/);
  expect(files.close()).toBe(closing);
  await closing;
});
test("caller cancellation keeps the offer receipt and waits for retirement without closing the runtime", async () => {
  const entered = Promise.withResolvers<void>();
  const releaseOffer = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const releaseRetirement = Promise.withResolvers<void>();
  const caller = new AbortController();
  const primary = new Error("caller cancelled pending offer");
  const removed = spyOn(caller.signal, "removeEventListener");
  const files = runtime(async (request): Promise<unknown> => {
    if (request.operation === "offer") {
      entered.resolve();
      await releaseOffer.promise;
      return { ticket };
    }
    if (request.operation === "cancel") {
      expect(request.ticket).toBe(ticket);
      retiring.resolve();
      await releaseRetirement.promise;
      return null;
    }
    throw new Error("Cancelled inspection must not start transfer");
  });
  let settled = false;
  const inspection = files
    .inspect(input, { signal: caller.signal })
    .finally(() => {
      settled = true;
    });
  const rejected = assert.rejects(
    inspection,
    (error: unknown) => error === primary,
  );
  try {
    await entered.promise;
    caller.abort(primary);
    expect(settled).toBe(false);
    releaseOffer.resolve();
    await retiring.promise;
    expect(settled).toBe(false);
    releaseRetirement.resolve();
    await rejected;
    expect(removed).toHaveBeenCalledTimes(1);
  } finally {
    releaseOffer.resolve();
    releaseRetirement.resolve();
    await rejected;
    await files.close();
    removed.mockRestore();
  }
});

test("cancelled inspection retains cancellation and missing-receipt causes while fencing", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const caller = new AbortController();
  const primary = new Error("caller cancelled");
  const receiptFailure = new Error("offer reply lost");
  let fences = 0;
  const files = runtime(
    async (): Promise<never> => {
      entered.resolve();
      await release.promise;
      throw receiptFailure;
    },
    (): void => {
      fences++;
    },
  );
  const running = files.inspect(input, { signal: caller.signal });
  const rejected = assert.rejects(running, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    expect(error.errors).toEqual([primary, receiptFailure]);
    expect(error.cause).toBe(primary);
    return true;
  });
  try {
    await entered.promise;
    caller.abort(primary);
  } finally {
    release.resolve();
    await rejected;
    await files.close();
  }
  expect(fences).toBe(1);
});

test("shutdown observes a pending inspection offer and waits for acknowledged retirement", async () => {
  const offered = Promise.withResolvers<void>();
  const releaseOffer = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const releaseRetirement = Promise.withResolvers<void>();
  const files = runtime(async (request): Promise<unknown> => {
    if (request.operation === "offer") {
      offered.resolve();
      await releaseOffer.promise;
      return { ticket };
    }
    if (request.operation === "cancel") {
      expect(request.ticket).toBe(ticket);
      retiring.resolve();
      await releaseRetirement.promise;
      return null;
    }
    throw new Error("Inspection must not start after shutdown");
  });
  const inspection = files.inspect(input);
  const rejected = assert.rejects(inspection, /File runtime closed/);
  await offered.promise;
  let closed = false;
  const closing = files.close().finally(() => {
    closed = true;
  });
  const closeRejected = assert.rejects(closing, /cleanup failed/);
  releaseOffer.resolve();
  await retiring.promise;
  expect(closed).toBe(false);
  releaseRetirement.resolve();
  await Promise.all([rejected, closeRejected]);
  expect(closed).toBe(true);
});
