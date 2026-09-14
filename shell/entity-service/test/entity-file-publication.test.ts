import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createAssetRef } from "@brains/assets";
import { EntityBinaryClient } from "../src/entity-binary-client";
import {
  parseEntityBinaryControlRequest,
  type EntityBinaryControlRequest,
} from "../src/entity-binary-rpc";
import type { EntityFilePublicationInput } from "../src/entity-file-publication";
const ticket = "00000000-0000-4000-8000-000000000001";
const facts = { sizeBytes: 1, sha256: "a".repeat(64) };
const receipt = { ...facts, ticket: "00000000-0000-4000-8000-000000000002" };
const endpoint = { host: "127.0.0.1", port: 1, token: "a".repeat(64) };
const input = {
  sourceFile: "/trusted/input.png",
  sizeBytes: 1,
  publication: {
    operation: "createEntity",
    request: {
      entity: {
        id: "image",
        entityType: "image",
        content: createAssetRef(facts.sha256),
        metadata: {},
      },
    },
  },
} satisfies EntityFilePublicationInput;
const result = { entityId: "image", jobId: "", skipped: false };
function client(
  control: (request: EntityBinaryControlRequest) => Promise<unknown>,
  publish: (request: unknown) => Promise<unknown>,
  invalidate: () => void = (): void => {
    throw new Error("Unexpected fence");
  },
): EntityBinaryClient {
  return new EntityBinaryClient({
    transport: {
      control: (value, options): Promise<unknown> => {
        expect(options?.signal).toBeUndefined();
        return control(parseEntityBinaryControlRequest(value));
      },
      publication: (value, options): Promise<unknown> => {
        expect(options?.signal).toBeUndefined();
        return publish(value);
      },
      invalidate,
    },
  });
}
function setup(request: EntityBinaryControlRequest): Promise<unknown> {
  if (request.operation === "offer") return Promise.resolve({ ticket });
  if (request.operation === "upload") return Promise.resolve(receipt);
  if (request.operation === "endpoint") return Promise.resolve(endpoint);
  return Promise.reject(new Error("Unexpected cancellation"));
}
function drain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("file publication rejects prepared bytes before acquiring a ticket", async () => {
  let calls = 0;
  let touched = false;
  const assets = client(
    async (): Promise<never> => {
      calls++;
      throw new Error("Unexpected admission");
    },
    async (): Promise<never> => {
      throw new Error("Unexpected publication");
    },
  );
  const malformed = {
    ...input,
    publication: {
      ...input.publication,
      request: {
        ...input.publication.request,
        preparedAsset: {
          get bytes(): Uint8Array {
            touched = true;
            throw new Error("bytes accessed");
          },
        },
      },
    },
  };
  await assert.rejects(
    assets.publishFile(malformed, {
      upload: async (): Promise<never> => {
        throw new Error("Unexpected actor");
      },
    }),
  );
  const actors = {
    upload: async (): Promise<never> => {
      throw new Error("Unexpected actor");
    },
  };
  await assert.rejects(
    assets.publishFile({ ...input, sizeBytes: 100 * 1024 * 1024 + 1 }, actors),
  );
  await assert.rejects(
    assets.publishFile({ ...input, sourceFile: "relative" }, actors),
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    assets.publishFile(input, actors, { signal: aborted.signal }),
  );
  expect(calls).toBe(0);
  expect(touched).toBe(false);
});
test("publication waits for actor exit and ignores late cancellation once submitted", async () => {
  const actor = Promise.withResolvers<typeof facts>();
  const started = Promise.withResolvers<void>();
  const submitted = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<unknown>();
  const signal = new AbortController();
  let publications = 0;
  const assets = client(setup, (value): Promise<unknown> => {
    publications++;
    expect(value).toMatchObject({ request: { assetUploadId: receipt.ticket } });
    submitted.resolve();
    return committed.promise;
  });
  const operation = assets.publishFile(
    input,
    {
      upload: (): Promise<typeof facts> => {
        started.resolve();
        return actor.promise;
      },
    },
    { signal: signal.signal },
  );
  await started.promise;
  await drain();
  expect(publications).toBe(0);
  actor.resolve(facts);
  await submitted.promise;
  signal.abort(new Error("too late to retract"));
  committed.resolve(result);
  expect(await operation).toEqual(result);
  expect(publications).toBe(1);
});
test("actor failure cancels the stable offer authority and waits for native retirement", async () => {
  const primary = new Error("source failed");
  const native = Promise.withResolvers<unknown>();
  const entered = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<unknown>();
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "upload") return native.promise;
      if (request.operation === "cancel") {
        expect(request.ticket).toBe(ticket);
        entered.resolve();
        return retired.promise;
      }
      return setup(request);
    },
    async (): Promise<never> => {
      throw new Error("Unexpected publication");
    },
  );
  let done = false;
  const rejected = assert
    .rejects(
      assets.publishFile(input, {
        upload: async (): Promise<never> => {
          throw primary;
        },
      }),
      (error: unknown) => error === primary,
    )
    .then(() => {
      done = true;
    });
  await entered.promise;
  await drain();
  expect(done).toBe(false);
  native.reject(primary);
  retired.resolve(null);
  await rejected;
  expect(await assets.offer(1)).toEqual({ ticket });
});
test("cancellation after sealing still joins the actor and retires the offer authority", async () => {
  const primary = new Error("cancel before publication");
  const actor = Promise.withResolvers<typeof facts>();
  const started = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<void>();
  const signal = new AbortController();
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "cancel") {
        expect(request.ticket).toBe(ticket);
        retired.resolve();
        return null;
      }
      return setup(request);
    },
    async (): Promise<never> => {
      throw new Error("Unexpected publication");
    },
  );
  const operation = assets.publishFile(
    input,
    {
      upload: (): Promise<typeof facts> => {
        started.resolve();
        return actor.promise;
      },
    },
    { signal: signal.signal },
  );
  let done = false;
  const rejected = assert
    .rejects(operation, (error: unknown) => error === primary)
    .then(() => {
      done = true;
    });
  await started.promise;
  await drain();
  signal.abort(primary);
  await retired.promise;
  await drain();
  expect(done).toBe(false);
  actor.reject(primary);
  await rejected;
});

test("sealed uploads are retired after digest mismatch without publication", async () => {
  let cancelled = false;
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "upload")
        return { ...receipt, sha256: "b".repeat(64) };
      if (request.operation === "cancel") {
        cancelled = true;
        return null;
      }
      return setup(request);
    },
    async (): Promise<never> => {
      throw new Error("Unexpected publication");
    },
  );
  await assert.rejects(
    assets.publishFile(input, {
      upload: async (): Promise<typeof facts> => ({
        ...facts,
        sha256: "b".repeat(64),
      }),
    }),
    /digest or size/,
  );
  expect(cancelled).toBe(true);
});
test("failed upload retirement preserves both causes and fences reuse", async () => {
  const primary = new Error("file failed");
  const cleanup = new Error("retirement unavailable");
  let fenced = false;
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "cancel") throw cleanup;
      return setup(request);
    },
    async (): Promise<never> => {
      throw new Error("Unexpected publication");
    },
    (): void => {
      fenced = true;
    },
  );
  await assert.rejects(
    assets.publishFile(input, {
      upload: async (): Promise<never> => {
        throw primary;
      },
    }),
    (error: unknown) => {
      if (!(error instanceof AggregateError)) return false;
      expect(error.errors).toContain(primary);
      expect(error.errors).toContain(cleanup);
      return true;
    },
  );
  expect(fenced).toBe(true);
  await assert.rejects(assets.offer(1), /fenced/);
});

test("uncertain publication is fenced, never cancelled or replayed", async () => {
  const primary = new Error("publication outcome unavailable");
  let publications = 0;
  let fenced = false;
  const assets = client(
    setup,
    async (): Promise<never> => {
      publications++;
      throw primary;
    },
    (): void => {
      fenced = true;
    },
  );
  await assert.rejects(
    assets.publishFile(input, {
      upload: async (): Promise<typeof facts> => facts,
    }),
    (error: unknown) => error === primary,
  );
  expect(publications).toBe(1);
  expect(fenced).toBe(true);
  await assert.rejects(assets.offer(1), /fenced/);
});
