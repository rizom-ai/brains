import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class mirrors the brain's records
 * as its class did through context.entityService and context.bulkMutations:
 * every type read and written as the file says, records serialized and
 * parsed by their type's own adapter, the durable export ledger drained
 * and acknowledged, and its sweeps run under the bulk coordination.
 * Directory-sync is its one consumer.
 */

describe("a first-party service's entity mirror", () => {
  it("hands every read and write to the entity service as its class did", async () => {
    const shell = createMockShell();
    const entities = shell.getEntityService();
    const methods = [
      "getEntityTypes",
      "hasEntityType",
      "listEntities",
      "getEntityRaw",
      "getEntityWriteSnapshot",
      "createEntity",
      "upsertEntity",
      "deleteEntity",
      "runBulkMutation",
      "serializeEntity",
      "deserializeEntity",
      "listPendingEntityExports",
      "hasPendingEntityExports",
      "acknowledgeEntityExports",
      "getAsyncJobStatus",
    ] as const;
    const calls: Array<[string, unknown[]]> = [];
    for (const method of methods) {
      const original = Reflect.get(entities, method);
      if (typeof original !== "function") throw new Error(method);
      spyOn(entities, method).mockImplementation(
        // The service's own answer, recorded on the way.
        (...args: unknown[]) => {
          calls.push([method, args]);
          return Reflect.apply(original, entities, args);
        },
      );
    }
    let runtime: ServiceRuntime | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "probe",
        config: z.object({}),
        setup: (context) => {
          runtime = serviceRuntime(context);
          return {};
        },
      }),
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    await plugin?.register(shell);
    if (!runtime) throw new Error("Setup did not run");
    const mirror = runtime.entityMirror;

    const note = {
      id: "n1",
      entityType: "note",
      content: "One",
      visibility: "public" as const,
      metadata: {},
      contentHash: "",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };
    const read = {
      entityType: "note",
      id: "n1",
      visibilityScope: "public" as const,
    };
    mirror.getEntityTypes();
    mirror.hasEntityType("note");
    await mirror.listEntities({ entityType: "note" });
    await mirror.getEntityRaw(read);
    await mirror.getEntityWriteSnapshot(read);
    await mirror.createEntity({ entity: note });
    await mirror.upsertEntity({ entity: note });
    await mirror.deleteEntity({ entityType: "note", id: "n1" });
    await mirror.runBulkMutation(
      { source: "probe", operationId: "sweep" },
      async () => "done",
    );
    mirror.serializeEntity(note);
    mirror.deserializeEntity("---\ntitle: One\n---\nOne", "note");
    await mirror.listPendingEntityExports();
    await mirror.hasPendingEntityExports();
    await mirror.acknowledgeEntityExports({ intents: [] });
    await mirror.getAsyncJobStatus("job-1");

    expect(calls.map(([method]) => method)).toEqual([...methods]);
    expect(calls.find(([method]) => method === "createEntity")?.[1]).toEqual([
      { entity: note },
    ]);
    // Its sweeps run under the bulk coordination its class used, the
    // entity service itself.
    expect(mirror.coordination).toBe(shell.getEntityService());
  });
});
