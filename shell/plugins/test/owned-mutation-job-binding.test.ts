import { expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createMockEntityService } from "../src/test/mock-entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createPluginHarness } from "../src/test/harness";

it("keeps definition arguments separate from read options and sanitizes malformed declarations", async () => {
  const record = defineEntity({
    type: "note",
    purpose: "Definition fixture",
    metadata: z.object({}),
  });
  const service = createMockEntityService(createMockEntityStore());
  await service.createEntity({
    entity: { entityType: "note", id: "one", content: "one", metadata: {} },
  });
  const { mutations } = createJobEntityAccess(
    service,
    new Set(["note"]),
    "job",
    undefined,
    { packageName: "@fixture/owned", declarationId: "job" },
  );
  const options = {
    visibilityScope: "public" as const,
    entityType: "foreign",
    id: "wrong",
  };
  const edit = await mutations.read(record, "one", options);
  expect(edit?.entity.id).toBe("one");
  if (!edit) throw new Error("Missing edit");
  expect(
    await mutations
      .replace(record, { ...edit }, edit.entity)
      .catch((error: unknown): unknown => error),
  ).toMatchObject({ code: "invalid_input" });
  const malformed = {
    ...record,
    get type(): "note" {
      throw new Error("Private declaration failure");
    },
  };
  const error = await mutations
    .read(malformed, "one")
    .catch((cause: unknown): unknown => cause);
  expect(error).toMatchObject({
    code: "invalid_input",
    cause: { message: "Private declaration failure" },
  });
  expect(JSON.stringify(error)).not.toContain("Private");
});

for (const operation of ["capture", "source-review"] as const)
  it(`pins the installed package and declaration separately for ${operation} receipt identity`, async () => {
    const namespace =
      operation === "capture" ? "faq.capture" : "faq.source-review";
    const record = defineEntity({
      type: "faq",
      purpose: "Namespace fixture",
      metadata: z.object({}),
    });
    const service = createMockEntityService(createMockEntityStore());
    await service.applyEntityMutationOnce({
      receipt: { namespace, key: "native" },
      operation: "none",
    });
    const owner = { packageName: "@brains/faq", declarationId: "capture" };
    const original = createJobEntityAccess(
      service,
      new Set(["faq"]),
      "not-authority",
      undefined,
      owner,
    ).mutations;
    owner.packageName = "@fixture/other";
    owner.declarationId = "other";
    expect(await original.once(record, operation, "native").get()).toEqual({
      operation: "none",
    });
    for (const identity of [
      { packageName: "@brains/faq", declarationId: "other" },
      { packageName: "@fixture/other", declarationId: "capture" },
      { packageName: "@brains/faq:capture", declarationId: "capture" },
    ]) {
      const other = createJobEntityAccess(
        service,
        new Set(["faq"]),
        "@brains/faq",
        undefined,
        identity,
      ).mutations;
      expect(await other.once(record, operation, "native").get()).toBeNull();
    }
  });

it("refuses previously issued edits and operation objects after job cancellation", async () => {
  const record = defineEntity({
    type: "note",
    purpose: "Cancellation fixture",
    metadata: z.object({ count: z.number() }),
  });
  const store = createMockEntityStore();
  const service = createMockEntityService(store);
  await service.createEntity({
    entity: {
      entityType: "note",
      id: "one",
      content: "one",
      metadata: { count: 1 },
    },
  });
  const controller = new AbortController();
  const { mutations } = createJobEntityAccess(
    service,
    new Set(["note"]),
    "job",
    undefined,
    {
      packageName: "@fixture/owned",
      declarationId: "job",
      signal: controller.signal,
    },
  );
  const edit = await mutations.read(record, "one");
  if (!edit) throw new Error("Missing edit");
  const operation = mutations.once(record, "capture", "reply");
  controller.abort();
  const refused = (promise: Promise<unknown>): Promise<unknown> =>
    promise.catch((error: unknown): unknown => error);
  expect(await refused(operation.get())).toMatchObject({ code: "cancelled" });
  expect(await refused(mutations.remove(record, edit))).toMatchObject({
    code: "cancelled",
  });
  expect(
    await refused(operation.complete({ operation: "none" })),
  ).toMatchObject({ code: "cancelled" });
  expect(
    await refused(
      mutations.replace(record, edit, { ...edit.entity, content: "late" }),
    ),
  ).toMatchObject({ code: "cancelled" });
  const fresh = createJobEntityAccess(
    service,
    new Set(["note"]),
    "job",
    undefined,
    { packageName: "@fixture/owned", declarationId: "job" },
  ).mutations;
  expect(await fresh.once(record, "capture", "reply").get()).toBeNull();
  expect((await fresh.read(record, "one"))?.entity.content).toBe("one");
});

it("issues mutation ownership from the installed background job, not a caller-bound tool", async () => {
  const record = defineEntity({
    type: "faq",
    purpose: "Receipt identity fixture",
    metadata: z.object({}),
  });
  const input = z.object({ key: z.string() });
  const output = z.union([
    z.object({ operation: z.literal("none") }),
    z.object({ operation: z.enum(["create", "update"]), entityId: z.string() }),
  ]);
  const capture = defineJob({ name: "capture", input, output });
  const definition = defineServicePlugin(
    { id: "capture", config: z.object({}), entities: [record] },
    {
      jobs: () => [
        capture.handle(async ({ entities, input }) =>
          entities.mutations.once(record, "capture", input.key).complete({
            operation: "create",
            entity: {
              entityType: "faq",
              id: "new",
              content: "answer",
              metadata: {},
            },
          }),
        ),
      ],
      tools: () => [
        defineTool({
          name: "attempt",
          description: "No implicit job authority",
          input,
          output,
          execute: ({ entities, input }) =>
            entities.mutations
              .once(record, "capture", input.key)
              .complete({ operation: "none" }),
        }),
      ],
    },
  );
  const harness = createPluginHarness();
  try {
    const installed = await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@brains/faq", version: "0.0.0" },
      ),
    );
    await harness.finalizeRegistration();
    const service = harness.getEntityService();
    await service.applyEntityMutationOnce({
      receipt: { namespace: "faq.capture", key: "native" },
      operation: "none",
    });
    expect(
      await harness.runJob("@brains/faq:capture:capture", { key: "native" }),
    ).toEqual({ operation: "none" });
    expect(
      await service.getEntity({ entityType: "faq", id: "new" }),
    ).toBeNull();
    expect(
      await harness.runJob("@brains/faq:capture:capture", { key: "fresh" }),
    ).toEqual({ operation: "create", entityId: "new" });
    expect(
      await service.getEntityMutationReceipt({
        namespace: "faq.capture",
        key: "fresh",
      }),
    ).toEqual({ operation: "create", entityType: "faq", entityId: "new" });
    const tool = installed.flatMap((item) => item.capabilities.tools)[0];
    if (!tool) throw new Error("Missing tool fixture");
    expect(
      await harness.callTool(
        tool,
        { key: "unissued" },
        {
          interfaceType: "test",
          actor: { kind: "service", serviceId: "test" },
          userPermissionLevel: "admin",
        },
      ),
    ).toMatchObject({ success: false, code: "permission_denied" });
    expect(
      await service.getEntityMutationReceipt({
        namespace: "faq.capture",
        key: "unissued",
      }),
    ).toBeNull();
  } finally {
    await harness.reset();
  }
});
