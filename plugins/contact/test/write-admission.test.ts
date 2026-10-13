import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createServicePluginContext, type BaseEntity } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import {
  registerContactWriteAdmission,
  CONTACT_WRITE_ADMISSION,
} from "../src/write-admission";

const entity: BaseEntity = {
  id: `contact-${"a".repeat(64)}`,
  entityType: "contact-request",
  visibility: "restricted",
  content: "Private contact",
  metadata: {},
  contentHash: "hash",
  created: "2026-09-01T00:00:00.000Z",
  updated: "2026-09-01T00:00:00.000Z",
};

test("Contact admission binds identity, type, operation and restricted visibility before consulting its slot", async () => {
  const shell = createMockShell();
  const context = createServicePluginContext(shell, "contact");
  let checks = 0;
  const unregister = registerContactWriteAdmission(context.entities, {
    assertWritable: async (id): Promise<void> => {
      expect(id).toBe(entity.id);
      checks++;
    },
  });
  const options = {
    writeAdmission: {
      name: CONTACT_WRITE_ADMISSION,
      payload: { id: entity.id },
    },
  };
  const admissions = shell.getEntityRegistry().writeAdmissions;
  const create = admissions.prepare(options, "create");
  const update = admissions.prepare(options, "update");
  assert(create && update);
  for (const invalid of [
    { ...entity, id: "other" },
    { ...entity, entityType: "note" },
    { ...entity, visibility: "public" as const },
  ]) {
    await assert.rejects(create(invalid), /Contact write unavailable/);
  }
  await assert.rejects(update(entity), /Contact write unavailable/);
  expect(checks).toBe(0);
  await create(entity);
  expect(checks).toBe(1);
  unregister();
  await assert.rejects(create(entity), /removed/);
});

test("Contact admission rechecks cancellation after the slot read", async () => {
  const shell = createMockShell();
  const controller = new AbortController();
  const reason = new Error("Contact cancelled during slot read");
  registerContactWriteAdmission(
    createServicePluginContext(shell, "contact").entities,
    {
      assertWritable: async (): Promise<void> => {
        controller.abort(reason);
      },
    },
  );
  const guard = shell.getEntityRegistry().writeAdmissions.prepare(
    {
      writeAdmission: {
        name: CONTACT_WRITE_ADMISSION,
        payload: { id: entity.id },
      },
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
