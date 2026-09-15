import { expect, test, spyOn } from "bun:test";
import assert from "node:assert/strict";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import { EntityFileRuntime } from "../src/entity-file-runtime";
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
