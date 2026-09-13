import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { DrizzleQueryError } from "drizzle-orm";
import {
  serializeError,
  deserializeError,
  errorSchema,
  MAX_ERROR_BYTES,
  MAX_ERROR_NODES,
  MAX_ERROR_DEPTH,
} from "../src/turso-worker/error-protocol";
import { TursoThreadProof } from "./fixtures/turso-thread/client";
import {
  ProofBudgetPool,
  type BudgetMember,
} from "./fixtures/turso-thread/budget-pool";
import { VERIFY_SCRATCH_BYTES } from "../src/turso-worker/blob-protocol";

function roundtrip(error: unknown): Error {
  return deserializeError(structuredClone(serializeError(error)));
}
describe("bounded cross-worker error graphs", () => {
  it("omits Drizzle SQL and binary parameters while retaining the underlying failure", () => {
    const cause = new Error("Resident binding was not admitted");
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 7, 0x5a);
    const query = new DrizzleQueryError(
      "insert into assets values (?)",
      [bytes],
      cause,
    );
    const restored = roundtrip(query);
    assert.equal(restored.message, "Failed query (SQL and parameters omitted)");
    assert(restored.cause instanceof Error);
    assert.equal(restored.cause.message, cause.message);
    assert.equal(Reflect.get(restored, "diagnosticsTruncated"), true);
    for (const input of [
      query,
      query.message,
      new Error(`Asset failure: ${query.message}`),
    ]) {
      const graph = serializeError(input);
      assert.equal(graph.nodes[0]?.message, restored.message);
      assert.equal(JSON.stringify(graph).includes("ZZZZ"), false);
      assert(Buffer.byteLength(JSON.stringify(graph)) <= MAX_ERROR_BYTES);
    }
    assert.equal(query.params[0], bytes);
    assert.equal(query.cause, cause);
  });
  it("preserves primary/cleanup causes, string codes, aggregate type and shared identities", () => {
    const primary = new Error("statement failed");
    Object.defineProperty(primary, "code", { value: "SQLITE_CONSTRAINT" });
    const cleanup = new Error("finalization failed");
    cleanup.name = "NativeCleanupError";
    const aggregate = new AggregateError([primary, cleanup], "both failed", {
      cause: cleanup,
    });
    const restored = roundtrip(new Error("owner lost", { cause: aggregate }));
    assert(restored.cause instanceof AggregateError);
    const [first, second] = restored.cause.errors;
    assert(first instanceof Error && second instanceof Error);
    assert.equal(first.message, "statement failed");
    assert.equal(Reflect.get(first, "code"), "SQLITE_CONSTRAINT");
    assert.equal(second.name, "NativeCleanupError");
    assert.equal(restored.cause.cause, second);
    assert.equal(Reflect.get(restored, "diagnosticsTruncated"), undefined);
  });
  it("retains cycles without recursive serialization or duplicated error objects", () => {
    const root = new AggregateError([], "cycle");
    root.cause = root;
    root.errors.push(root, new Error("leaf", { cause: root }));
    const restored = roundtrip(root);
    assert(restored instanceof AggregateError);
    assert.equal(restored.cause, restored);
    assert.equal(restored.errors[0], restored);
    const leaf: unknown = restored.errors[1];
    assert(leaf instanceof Error);
    assert.equal(leaf.cause, restored);
    assert.equal(serializeError(root).nodes.length, 2);
  });
  it("bounds escaped Unicode text, breadth and depth and marks every reconstructed node as incomplete", () => {
    let deep = new Error("deepest");
    for (let index = 0; index < 30; index++)
      deep = new Error(`depth-${index}`, { cause: deep });
    const children = [
      deep,
      ...Array.from(
        { length: 100 },
        () => new Error("\u0000\n😀".repeat(10000)),
      ),
    ];
    const input = new AggregateError(children, "root".repeat(10000));
    const wire = serializeError(input);
    assert.equal(wire.truncated, true);
    assert(wire.nodes.length <= MAX_ERROR_NODES);
    assert(Buffer.byteLength(JSON.stringify(wire)) <= MAX_ERROR_BYTES);
    const restored = deserializeError(wire);
    assert.equal(Reflect.get(restored, "diagnosticsTruncated"), true);
    assert(restored instanceof AggregateError);
    const first: unknown = restored.errors[0];
    assert(first instanceof Error);
    assert.equal(Reflect.get(first, "diagnosticsTruncated"), true);
    assert.equal(wire.nodes[0]?.errors?.length, 8);
  });
  it("caps dense aggregate graphs at the node budget without losing the byte bound", () => {
    const children = Array.from(
      { length: 8 },
      () =>
        new AggregateError(
          Array.from({ length: 8 }, () => new Error("leaf")),
          "branch",
        ),
    );
    const wire = serializeError(new AggregateError(children, "root"));
    expect(wire.nodes).toHaveLength(MAX_ERROR_NODES);
    expect(wire.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(wire))).toBeLessThanOrEqual(
      MAX_ERROR_BYTES,
    );
  });
  it("keeps a sibling cleanup diagnostic when the primary branch exceeds the depth limit", () => {
    let primary = new Error("bottom");
    for (let index = 0; index < MAX_ERROR_DEPTH + 2; index++)
      primary = new Error("primary", { cause: primary });
    const restored = roundtrip(
      new AggregateError([primary, new Error("cleanup evidence")], "failure"),
    );
    assert(restored instanceof AggregateError);
    const cleanup: unknown = restored.errors[1];
    assert(cleanup instanceof Error);
    assert.equal(cleanup.message, "cleanup evidence");
    assert.equal(Reflect.get(restored, "diagnosticsTruncated"), true);
  });
  it("does not invoke getters, proxy traps, custom stringifiers or aggregate iterators", () => {
    let invoked = 0;
    const trap = (): never => {
      invoked++;
      throw new Error("must not execute");
    };
    const primary = new Error("primary");
    Object.defineProperty(primary, "message", { get: trap });
    Object.defineProperty(primary, "cause", { get: trap });
    Object.defineProperty(primary, "stack", { get: trap });
    const proxy = new Proxy(new Error("hidden"), {
      get: trap,
      getOwnPropertyDescriptor: trap,
      getPrototypeOf: trap,
    });
    const root = new AggregateError([], "safe");
    root.errors = [primary, proxy, { toString: trap }];
    Object.defineProperty(root.errors, Symbol.iterator, { value: trap });
    const restored = roundtrip(root);
    expect(invoked).toBe(0);
    expect(restored.message).toBe("safe");
    expect(Reflect.get(restored, "diagnosticsTruncated")).toBe(true);
  });
  it("normalizes unsupported thrown values explicitly rather than claiming lossless transport", () => {
    for (const value of [
      undefined,
      null,
      true,
      1n,
      Symbol("value"),
      { message: "object" },
    ]) {
      const restored = roundtrip(value);
      assert.equal(restored.name, "NonError");
      assert.equal(Reflect.get(restored, "diagnosticsTruncated"), true);
    }
    expect(roundtrip("literal thrown string").message).toBe(
      "literal thrown string",
    );
  });
  it("retains omission markers across repeated relays and reports unsupported name fields", () => {
    const clipped = roundtrip(new Error("x".repeat(1000)));
    const relayed = roundtrip(new Error("relay", { cause: clipped }));
    expect(Reflect.get(relayed, "diagnosticsTruncated")).toBe(true);
    const unusual = new Error("message");
    Object.defineProperty(unusual, "name", { value: 123 });
    expect(serializeError(unusual).truncated).toBe(true);
  });
  it("rejects malformed, unreachable, excessively deep or oversized diagnostic graphs", () => {
    const node = { name: "Error", message: "bad" };
    for (const nodes of [
      [],
      [{ ...node, cause: 1 }],
      [node, node],
      Array.from({ length: MAX_ERROR_DEPTH + 2 }, (_, index) =>
        index === MAX_ERROR_DEPTH + 1 ? node : { ...node, cause: index + 1 },
      ),
      [{ ...node, errors: Array(9).fill(0) }],
      [{ ...node, message: "\u0000".repeat(512) }],
    ]) {
      assert.throws(() => errorSchema.parse({ nodes, truncated: false }));
    }
    expect(
      errorSchema.parse(serializeError(new Error("valid"))).truncated,
    ).toBe(false);
  });
  it("fails pending work and joins before reclaiming credit after a malformed error reply", async () => {
    const stopping = Promise.withResolvers<void>();
    const allowExit = Promise.withResolvers<void>();
    class PausedExitPool extends ProofBudgetPool {
      public override admit(): BudgetMember {
        const member = super.admit();
        return {
          ...member,
          bind: (worker): void => {
            member.bind(worker);
            const terminate = worker.terminate.bind(worker);
            let termination: Promise<number> | undefined;
            worker.terminate = (): Promise<number> => {
              termination ??= (async (): Promise<number> => {
                stopping.resolve();
                await allowExit.promise;
                return terminate();
              })();
              return termination;
            };
          },
        };
      }
    }
    const pool = new PausedExitPool();
    const driver = new TursoThreadProof({
      url: "file::memory:",
      budget: pool,
      workerUrl: new URL(
        "./fixtures/turso-thread/invalid-error-worker.ts",
        import.meta.url,
      ),
    });
    try {
      await assert.rejects(
        driver.verifyBlob({
          table: "not_opened",
          column: "bytes",
          key: [{ column: "id", value: 1 }],
          maxBytes: 1,
        }),
        (error) => {
          assert(error instanceof Error);
          assert.equal(error.name, "PersistenceOwnerLostError");
          assert(error.cause instanceof Error);
          assert.match(error.cause.message, /Invalid bounded error graph/);
          return true;
        },
      );
      await stopping.promise;
      assert.equal(pool.stats().fencedMembers, 1);
      assert.equal(pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
      allowExit.resolve();
      await assert.rejects(driver.close(), /owner lost/i);
      assert.equal(pool.stats().scratchBytes, 0);
      assert.equal(pool.stats().members, 0);
    } finally {
      allowExit.resolve();
      await driver.terminateForProof();
      await assert.rejects(driver.close());
    }
  });
});
