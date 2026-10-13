import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import {
  EntityWriteAdmissions,
  entityWriteAdmissionSchema,
} from "../src/entity-write-admissions";
import { createTestEntity } from "../src/test/fixtures";

const entity = createTestEntity("note", { id: "guarded" });

test("admission references have strict JSON, namespaced names and a UTF-8 byte bound", () => {
  expect(
    entityWriteAdmissionSchema.safeParse({
      name: "plugin:guard",
      payload: { value: "small" },
    }).success,
  ).toBe(true);
  for (const reference of [
    { name: "unscoped", payload: null },
    { name: "plugin:guard", payload: {}, extra: true },
    { name: "plugin:guard", payload: { callback: (): void => {} } },
    { name: "plugin:guard", payload: "💾".repeat(4096) },
  ])
    expect(entityWriteAdmissionSchema.safeParse(reference).success).toBe(false);
});

test("owner schema parsing snapshots payloads and rejects duplicate or unknown guards", async () => {
  const registry = new EntityWriteAdmissions();
  let observed: string | undefined;
  const schema = z.strictObject({ grant: z.string() });
  registry.register(
    "plugin:guard",
    schema,
    async (_context, payload): Promise<void> => {
      observed = payload.grant;
    },
  );
  expect(() =>
    registry.register("plugin:guard", schema, async (): Promise<void> => {}),
  ).toThrow("already registered");
  const reference = { name: "plugin:guard", payload: { grant: "original" } };
  const guard = registry.prepare({ writeAdmission: reference }, "create");
  assert(guard);
  reference.payload.grant = "changed";
  await guard(entity);
  expect(observed).toBe("original");
  expect(() =>
    registry.prepare(
      { writeAdmission: { name: "unknown:guard", payload: {} } },
      "create",
    ),
  ).toThrow("Unknown write admission");
  expect(() =>
    registry.prepare(
      { writeAdmission: { name: "plugin:guard", payload: {} } },
      "create",
    ),
  ).toThrow();
  expect(() =>
    registry.prepare(
      { writeAdmission: reference, beforeWrite: async (): Promise<void> => {} },
      "create",
    ),
  ).toThrow("Cannot combine");
});

test("disposal revokes prepared guards and stale disposal cannot remove a replacement", async () => {
  const registry = new EntityWriteAdmissions();
  const dispose = registry.register(
    "plugin:guard",
    z.null(),
    async (): Promise<void> => {},
  );
  const options = { writeAdmission: { name: "plugin:guard", payload: null } };
  const old = registry.prepare(options, "update");
  assert(old);
  dispose();
  let calls = 0;
  registry.register("plugin:guard", z.null(), async (): Promise<void> => {
    calls++;
  });
  dispose();
  await assert.rejects(old(entity), /removed/);
  const replacement = registry.prepare(options, "update");
  assert(replacement);
  await replacement(entity);
  expect(calls).toBe(1);
});

test("cancellation is rechecked after asynchronous authorization", async () => {
  const registry = new EntityWriteAdmissions();
  const controller = new AbortController();
  const reason = new Error("revoked while authorizing");
  registry.register("plugin:guard", z.null(), async (): Promise<void> => {
    controller.abort(reason);
  });
  const guard = registry.prepare(
    {
      writeAdmission: { name: "plugin:guard", payload: null },
      signal: controller.signal,
    },
    "create",
  );
  assert(guard);
  await assert.rejects(
    guard(entity),
    (error: unknown): boolean => error === reason,
  );
});
