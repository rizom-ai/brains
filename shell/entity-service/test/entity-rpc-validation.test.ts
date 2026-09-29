import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import { EntityValidationError, isEntityValidationError } from "../src/errors";
import {
  ENTITY_VALIDATION_RPC_BYTES,
  throwEntityRpcValidationFailure,
  withEntityRpcValidation,
} from "../src/entity-rpc-validation";
import { EntityBinaryClient } from "../src/entity-binary-client";

async function failure(
  originalError: unknown,
  phase: "schema" | "persist" = "persist",
): Promise<unknown> {
  return withEntityRpcValidation(async () => {
    throw new EntityValidationError("note", originalError, phase);
  });
}

test.each(["schema", "persist"] as const)(
  "domain validation preserves %s phase and field issues without serializing arbitrary error data",
  async (phase) => {
    const original = new z.ZodError([
      {
        code: "custom",
        path: ["areas", 0],
        message: "Choose a configured area",
      },
    ]);
    Object.defineProperty(original, "entity", {
      value: "private-content-canary",
    });
    const wire: unknown = JSON.parse(
      JSON.stringify(await failure(original, phase)),
    );
    assert.throws(
      () => throwEntityRpcValidationFailure(wire),
      (error: unknown) => {
        assert(error instanceof EntityValidationError);
        expect(isEntityValidationError(error)).toBe(true);
        expect(error.entityType).toBe("note");
        expect(error.phase).toBe(phase);
        expect(error.message).toContain("Choose a configured area");
        expect(error).toMatchObject({ diagnosticsTruncated: false });
        expect(error.originalError).toMatchObject({
          issues: [{ path: ["areas", 0], message: "Choose a configured area" }],
        });
        return true;
      },
    );
    expect(JSON.stringify(wire)).not.toContain("private-content-canary");
  },
);

test("diagnostics remain bounded after JSON escaping and never mislabel a truncated field path", async () => {
  const wire = await failure({
    message: "Rejected",
    issues: Array.from({ length: 100 }, () => ({
      path: Array.from({ length: 8 }, () => "\u0000".repeat(128)),
      message: "\u0000".repeat(10_000),
    })),
  });
  expect(Buffer.byteLength(JSON.stringify(wire))).toBeLessThanOrEqual(
    ENTITY_VALIDATION_RPC_BYTES,
  );
  assert.throws(
    () => throwEntityRpcValidationFailure(wire),
    (error: unknown) => {
      expect(error).toMatchObject({
        diagnosticsTruncated: true,
        phase: "persist",
      });
      return true;
    },
  );
  const longPath = await failure({
    message: "Rejected",
    issues: [{ path: ["secret".repeat(1000)], message: "Invalid" }],
  });
  assert.throws(
    () => throwEntityRpcValidationFailure(longPath),
    (error: unknown) => {
      expect(error).toMatchObject({
        originalError: { issues: [{ path: [], message: "Invalid" }] },
        diagnosticsTruncated: true,
      });
      return true;
    },
  );
});

test("getters, proxies and query payloads are not diagnostic serialization authority", async () => {
  let getterCalls = 0;
  const original = { message: "Rejected" };
  Object.defineProperty(original, "issues", {
    get: () => {
      getterCalls++;
      throw new Error("Do not inspect");
    },
  });
  await failure(original);
  await failure({
    message: "Rejected",
    issues: new Proxy([], {
      get: (): never => {
        getterCalls++;
        throw new Error("Do not inspect");
      },
    }),
  });
  expect(getterCalls).toBe(0);
  const wire = await failure({
    message: "Rejected",
    issues: [
      {
        path: [],
        message: "Failed query: SELECT secret-canary\nparams: binary-canary",
      },
    ],
  });
  expect(JSON.stringify(wire)).not.toContain("secret-canary");
  expect(JSON.stringify(wire)).not.toContain("binary-canary");
});

test("unknown and aggregate failures retain their original outcome graph", async () => {
  const validation = new EntityValidationError(
    "note",
    { message: "Rejected" },
    "persist",
  );
  const aggregate = new AggregateError(
    [validation, new Error("Cleanup failed")],
    "Uncertain retirement",
    { cause: validation },
  );
  for (const error of [new Error("Unknown outcome"), aggregate]) {
    await assert.rejects(
      withEntityRpcValidation(async () => {
        throw error;
      }),
      (received: unknown) => received === error,
    );
  }
});

test("malformed failure envelopes are refused rather than reconstructed", () => {
  expect(() =>
    throwEntityRpcValidationFailure({
      kind: "entity-validation-failure",
      phase: "made-up",
    }),
  ).toThrow();
  expect(() =>
    throwEntityRpcValidationFailure({
      kind: "entity-validation-failure",
      entityType: "note",
      phase: "persist",
      diagnosticsTruncated: false,
      issues: [{ path: [], message: "x".repeat(1000) }],
    }),
  ).toThrow();
});

test("a validated publication refusal does not fence the binary transport", async () => {
  let invalidated = false;
  let wire = await failure(
    new z.ZodError([
      { code: "custom", path: ["title"], message: "Title required" },
    ]),
  );
  const client = new EntityBinaryClient({
    assertLive: (): void => undefined,
    transport: {
      invalidate: (): void => {
        invalidated = true;
      },
      control: async (): Promise<never> => {
        throw new Error("Unexpected control request");
      },
      publication: async (): Promise<unknown> => wire,
    },
  });
  const request = {
    operation: "createEntity" as const,
    assetUploadId: "00000000-0000-4000-8000-000000000001",
    request: {
      entity: {
        entityType: "note",
        id: "test",
        content: `asset://sha256/${"a".repeat(64)}`,
        metadata: {},
      },
    },
  };
  await assert.rejects(client.publish(request), EntityValidationError);
  expect(invalidated).toBe(false);
  await assert.rejects(
    client.publish({
      ...request,
      assetUploadId: "00000000-0000-4000-8000-000000000002",
    }),
    EntityValidationError,
  );
  wire = { kind: "entity-validation-failure", phase: "invalid" };
  await assert.rejects(
    client.publish({
      ...request,
      assetUploadId: "00000000-0000-4000-8000-000000000003",
    }),
  );
  expect(invalidated).toBe(true);
});
