import { expect, test, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src/public/entity-definition";
import { AuthRegistry } from "../src/contracts/auth-registry";
import {
  issueRouteCaller,
  revokeRouteCaller,
} from "../src/internal/route-caller-authority";
import { createInboxEntityEdits } from "../src/internal/inbox-entity-edits";
import { createMockEntityService } from "../src/test/mock-entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import type { InterfaceCaller } from "../src/interface/route-contract";

const record = defineEntity({
  type: "note",
  purpose: "Caller editing fixture",
  metadata: z.object({ status: z.string(), count: z.number() }),
});
const other = defineEntity({
  type: "other",
  purpose: "Unowned fixture",
  metadata: z.object({}),
});
const presentation: InterfaceCaller = {
  actor: { id: "session-user", canonicalId: "person" },
  permission: "admin",
  isAnchor: true,
};
async function fixture(): Promise<
  Omit<Parameters<typeof createInboxEntityEdits>[0], "ownedTypes"> & {
    ownedTypes: Set<string>;
    entities: ReturnType<typeof createMockEntityService>;
    store: ReturnType<typeof createMockEntityStore>;
    policy: { allowed: boolean };
    checked: string[];
    edits: ReturnType<typeof createInboxEntityEdits>;
  }
> {
  const authority = AuthRegistry.createFresh();
  const caller = issueRouteCaller(presentation, authority);
  const store = createMockEntityStore();
  const entities = createMockEntityService(store);
  await entities.createEntity({
    entity: {
      entityType: "note",
      id: "one",
      content: "Original",
      visibility: "restricted",
      metadata: { status: "draft", count: 1 },
    },
  });
  const ownedTypes = new Set(["note"]);
  const policy = { allowed: true };
  const checked: string[] = [];
  const deps = {
    entities,
    authority,
    caller,
    ownedTypes,
    assertAllowed: (type: string, action: string, permission: string): void => {
      checked.push(`${type}:${action}:${permission}`);
      if (!policy.allowed) throw new Error("Private policy diagnostic");
    },
  };
  return {
    ...deps,
    store,
    policy,
    checked,
    edits: createInboxEntityEdits(deps),
  };
}
const caught = (error: unknown): unknown => error;

test("Inbox editing refuses fabricated, copied and foreign-runtime callers before storage", async () => {
  const f = await fixture();
  const read = spyOn(f.entities, "getEntityWriteSnapshot");
  for (const caller of [
    presentation,
    { ...f.caller },
    issueRouteCaller(presentation, AuthRegistry.createFresh()),
  ]) {
    expect(() => createInboxEntityEdits({ ...f, caller })).toThrow();
  }
  expect(read).not.toHaveBeenCalled();
});

test("Inbox editing pins installed ownership and instance-issued edits, then attributes the authenticated actor", async () => {
  const f = await fixture();
  f.ownedTypes.add("other");
  expect(await f.edits.read(other, "foreign").catch(caught)).toMatchObject({
    code: "permission_denied",
  });
  const edit = await f.edits.read(record, "one");
  if (!edit) throw new Error("Missing issued edit");
  expect(Object.isFrozen(edit.entity.metadata)).toBe(true);
  const next = { ...edit.entity, content: "Changed" };
  expect(
    await f.edits.replace(record, { ...edit }, next).catch(caught),
  ).toMatchObject({ code: "invalid_input" });
  expect(
    await createInboxEntityEdits(f).replace(record, edit, next).catch(caught),
  ).toMatchObject({ code: "invalid_input" });
  const write = spyOn(f.entities, "updateEntity");
  await f.edits.replace(record, edit, next);
  expect(f.checked).toEqual(["note:update:admin"]);
  expect(write.mock.calls[0]?.[0].options?.eventContext).toEqual({
    actor: { kind: "user", userId: "session-user", canonicalId: "person" },
  });
  expect(f.store.entities.get("one")?.content).toBe("Changed");
});

test("Inbox edits reject same-hash metadata drift and preserve the concurrent value", async () => {
  const f = await fixture();
  const edit = await f.edits.read(record, "one");
  if (!edit) throw new Error("Missing issued edit");
  const current = f.store.entities.get("one");
  if (!current) throw new Error("Missing current row");
  f.store.entities.set("one", {
    ...current,
    metadata: { status: "draft", count: 2 },
  });
  expect(
    await f.edits
      .replace(record, edit, { ...edit.entity, content: "Stale" })
      .catch(caught),
  ).toMatchObject({ code: "conflict" });
  expect(await f.edits.delete(record, edit).catch(caught)).toMatchObject({
    code: "conflict",
  });
  expect(f.store.entities.get("one")?.metadata["count"]).toBe(2);
});

test("Inbox policy is checked at write time and uses final persisted publication metadata", async () => {
  const f = await fixture();
  spyOn(f.entities, "getEntityTypeConfig").mockReturnValue({
    publish: { publishStatuses: ["published"] },
  });
  const edit = await f.edits.read(record, "one");
  if (!edit) throw new Error("Missing issued edit");
  f.policy.allowed = false;
  spyOn(f.entities, "updateEntity").mockImplementation(async (request) => {
    await request.options?.beforeWrite?.({
      ...request.entity,
      metadata: { status: "published", count: 1 },
    });
    throw new Error("Unauthorized write reached storage");
  });
  const result = await f.edits
    .replace(record, edit, {
      ...edit.entity,
      content: "Publish via codec",
      metadata: { status: "draft", count: 1 },
    })
    .catch(caught);
  expect(result).toMatchObject({ code: "permission_denied" });
  expect(f.checked).toEqual(["note:publish:admin"]);
  expect(JSON.stringify(result)).not.toContain("Private policy");
  expect(f.store.entities.get("one")?.metadata["status"]).toBe("draft");
});

test("revocation aborts in-flight writes at the native boundary, without deleting the entity", async () => {
  const f = await fixture();
  const edits = createInboxEntityEdits({
    ...f,
    assertAllowed: () => {
      revokeRouteCaller(f.caller);
    },
  });
  const edit = await edits.read(record, "one");
  if (!edit) throw new Error("Missing issued edit");
  expect(await edits.delete(record, edit).catch(caught)).toMatchObject({
    code: "cancelled",
  });
  expect(f.store.entities.has("one")).toBe(true);
  expect(await edits.read(record, "one").catch(caught)).toMatchObject({
    code: "unauthenticated",
  });
});

test("Inbox edits cannot retarget or change visibility and sanitize backend failures", async () => {
  const f = await fixture();
  const edit = await f.edits.read(record, "one");
  if (!edit) throw new Error("Missing issued edit");
  expect(
    await f.edits
      .replace(record, edit, { ...edit.entity, visibility: "public" })
      .catch(caught),
  ).toMatchObject({ code: "invalid_input" });
  expect(
    await f.edits
      .replace(record, edit, { ...edit.entity, id: "another" })
      .catch(caught),
  ).toMatchObject({ code: "invalid_input" });
  spyOn(f.entities, "deleteEntity").mockRejectedValue(
    new Error("Private database details"),
  );
  const result = await f.edits.delete(record, edit).catch(caught);
  expect(result).toMatchObject({
    code: "handler_failed",
    cause: { message: "Private database details" },
  });
  expect(JSON.stringify(result)).not.toContain("Private database");
});
