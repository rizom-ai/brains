import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createAssetRef } from "@brains/assets";
import { EntityBinaryClient } from "../src/entity-binary-client";
import {
  parseEntityBinaryControlRequest,
  type EntityBinaryControlRequest,
} from "../src/entity-binary-rpc";

const facts = { sizeBytes: 1, sha256: "a".repeat(64) };
const offer = { ...facts, ticket: "00000000-0000-4000-8000-000000000001" };
const endpoint = {
  host: "127.0.0.1",
  port: 1,
  token: "a".repeat(64),
  direction: "read",
};
function drainContinuations(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
const input = {
  ref: createAssetRef(facts.sha256),
  outputFile: "/trusted/output.png",
};
function client(
  handle: (request: EntityBinaryControlRequest) => Promise<unknown>,
  invalidate: () => void = (): void => {
    throw new Error("Unexpected fence");
  },
): EntityBinaryClient {
  return new EntityBinaryClient({
    transport: {
      control: (request, options): Promise<unknown> => {
        expect(options?.signal).toBeUndefined(); // Caller abort cannot discard cleanup replies.
        return handle(parseEntityBinaryControlRequest(request));
      },
      publication: async (): Promise<never> => {
        throw new Error("Unexpected publication");
      },
      invalidate,
    },
  });
}
test("file handoff rejects invalid paths and pre-aborted work before native admission", async () => {
  let calls = 0;
  const assets = client(async (): Promise<never> => {
    calls++;
    throw new Error("Unexpected admission");
  });
  const actors = {
    download: async (): Promise<never> => {
      throw new Error("Unexpected actor");
    },
  };
  const signal = new AbortController();
  signal.abort();
  await assert.rejects(
    assets.downloadFile(input, actors, { signal: signal.signal }),
  );
  await assert.rejects(
    assets.downloadFile({ ...input, outputFile: "relative" }, actors),
  );
  expect(calls).toBe(0);
});
test("file handoff waits for both the actor and native acknowledgement", async () => {
  const native = Promise.withResolvers<unknown>();
  const actor = Promise.withResolvers<typeof facts>();
  const started = Promise.withResolvers<void>();
  const assets = client(async (request): Promise<unknown> => {
    if (request.operation === "offerRead") return offer;
    if (request.operation === "download") return native.promise;
    if (request.operation === "readEndpoint") return endpoint;
    throw new Error("Unexpected cancellation");
  });
  let done = false;
  const result = assets.downloadFile(input, {
    download: (): Promise<typeof facts> => {
      started.resolve();
      return actor.promise;
    },
  });
  void result.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  await started.promise;
  actor.resolve(facts);
  await actor.promise;
  await drainContinuations();
  expect(done).toBe(false);
  native.resolve(facts);
  expect(await result).toEqual(facts);
});
test("cancellation during offer waits for the receipt and acknowledged idle retirement", async () => {
  const offered = Promise.withResolvers<unknown>();
  const admitted = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<unknown>();
  const signal = new AbortController();
  const primary = new Error("caller cancelled");
  const assets = client(async (request): Promise<unknown> => {
    if (request.operation === "offerRead") {
      admitted.resolve();
      return offered.promise;
    }
    if (request.operation === "cancelRead") {
      retiring.resolve();
      return retired.promise;
    }
    throw new Error("Unexpected download admission");
  });
  const result = assets.downloadFile(
    input,
    {
      download: async (): Promise<never> => {
        throw new Error("Unexpected actor");
      },
    },
    { signal: signal.signal },
  );
  let done = false;
  const rejected = assert
    .rejects(result, (error: unknown) => error === primary)
    .then(() => {
      done = true;
    });
  await admitted.promise;
  signal.abort(primary);
  offered.resolve(offer);
  await retiring.promise;
  await drainContinuations();
  expect(done).toBe(false);
  retired.resolve(null);
  await rejected;
});
test("active cancellation waits for native retirement and actor exit without aborting RPC replies", async () => {
  const native = Promise.withResolvers<unknown>();
  const actor = Promise.withResolvers<typeof facts>();
  const started = Promise.withResolvers<void>();
  const retiring = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<unknown>();
  const signal = new AbortController();
  const primary = new Error("caller cancelled");
  let actorSignal: AbortSignal | undefined;
  const assets = client(async (request): Promise<unknown> => {
    if (request.operation === "offerRead") return offer;
    if (request.operation === "download") return native.promise;
    if (request.operation === "readEndpoint") return endpoint;
    if (request.operation === "cancelRead") {
      retiring.resolve();
      return retired.promise;
    }
    throw new Error("Unexpected operation");
  });
  const result = assets.downloadFile(
    input,
    {
      download: (_input, cancellation): Promise<typeof facts> => {
        actorSignal = cancellation;
        started.resolve();
        return actor.promise;
      },
    },
    { signal: signal.signal },
  );
  let done = false;
  const rejected = assert
    .rejects(result, (error: unknown) => error === primary)
    .then(() => {
      done = true;
    });
  await started.promise;
  signal.abort(primary);
  await retiring.promise;
  expect(actorSignal?.aborted).toBe(true);
  retired.resolve(null);
  native.reject(primary);
  await native.promise.catch(() => undefined); // Joined by the handoff as well.
  await drainContinuations();
  expect(done).toBe(false);
  actor.reject(primary); // FileProcessOwner only settles after the real child exits.
  await rejected;
});
test("actor failure waits for acknowledged native cleanup and leaves the client reusable", async () => {
  const primary = new Error("file target failed");
  const native = Promise.withResolvers<unknown>();
  const retiring = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<unknown>();
  const assets = client(async (request): Promise<unknown> => {
    if (request.operation === "offerRead") return offer;
    if (request.operation === "download") return native.promise;
    if (request.operation === "readEndpoint") return endpoint;
    if (request.operation === "cancelRead") {
      retiring.resolve();
      return retired.promise;
    }
    throw new Error("Unexpected operation");
  });
  const result = assets.downloadFile(input, {
    download: async (): Promise<never> => {
      throw primary;
    },
  });
  let done = false;
  const rejected = assert
    .rejects(result, (error: unknown) => error === primary)
    .then(() => {
      done = true;
    });
  await retiring.promise;
  await drainContinuations();
  expect(done).toBe(false);
  native.reject(primary);
  retired.resolve(null);
  await rejected;
  expect(await assets.offerRead(input.ref)).toEqual(offer);
});

test("an unrelated offer is retired before fencing without starting an actor", async () => {
  let retired = false;
  let fenced = false;
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "offerRead")
        return { ...offer, sha256: "b".repeat(64) };
      if (request.operation === "cancelRead") {
        retired = true;
        return null;
      }
      throw new Error("Unexpected download admission");
    },
    (): void => {
      expect(retired).toBe(true);
      fenced = true;
    },
  );
  await assert.rejects(
    assets.downloadFile(input, {
      download: async (): Promise<never> => {
        throw new Error("Unexpected actor");
      },
    }),
    /asset reference/,
  );
  expect(fenced).toBe(true);
});

test("uncertain retirement preserves causes and fences reuse", async () => {
  const primary = new Error("endpoint failed");
  const cleanup = new Error("retirement unknown");
  let fenced = false;
  const assets = client(
    async (request): Promise<unknown> => {
      if (request.operation === "offerRead") return offer;
      if (
        request.operation === "download" ||
        request.operation === "readEndpoint"
      )
        throw primary;
      if (request.operation === "cancelRead") throw cleanup;
      throw new Error("Unexpected operation");
    },
    (): void => {
      fenced = true;
    },
  );
  await assert.rejects(
    assets.downloadFile(input, {
      download: async (): Promise<never> => {
        throw new Error("Unexpected actor");
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
  await assert.rejects(assets.offerRead(input.ref), /fenced/);
});
