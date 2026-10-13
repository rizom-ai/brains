import { describe, expect, test, spyOn } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { BatchOperationsManager } from "../src/lib/batch-operations";
import { directoryImportJobSchema } from "../src/types/jobs";

const entity: BaseEntity = {
  id: "grouping-definitions",
  entityType: "grouping-definitions",
  content: "Authored definitions",
  contentHash: "hash",
  metadata: {},
  visibility: "shared",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};
describe("queued import admission", () => {
  test("captures every batch before enqueue and retains the observed revision through serialization", async () => {
    const service = createMockEntityService();
    const read = spyOn(service, "getEntityWriteSnapshot").mockImplementation(
      async (request) =>
        request.entityType === "grouping-definitions"
          ? { entity, revision: "before-sync" }
          : null,
    );
    const context = createMockServicePluginContext({ entityService: service });
    const manager = new BatchOperationsManager({
      logger: createSilentLogger(),
      syncPath: "/tmp/import-plan",
      deleteOnFileRemoval: true,
    });
    const paths = [
      ...Array.from({ length: 50 }, (_, index) => `note/n${index}.md`),
      "grouping-definitions/grouping-definitions.md",
    ];
    await manager.queueSyncBatch(context, "test", paths);
    const operations = context.jobs.enqueueBatch.mock.calls[0]?.[0];
    if (!operations) throw new Error("Batch was not queued");
    const imports = operations
      .filter((operation) => operation.type === "directory-import")
      .map((operation) =>
        directoryImportJobSchema.parse(
          JSON.parse(JSON.stringify(operation.data)),
        ),
      );
    expect(read).toHaveBeenCalledTimes(51);
    expect(read).toHaveBeenCalledWith({
      entityType: "grouping-definitions",
      id: "grouping-definitions",
      visibilityScope: "restricted",
    });
    expect(imports[0]?.plan).toHaveLength(50);
    expect(imports[0]?.plan?.[0]).toEqual({
      path: "note/n0.md",
      entityType: "note",
      id: "n0",
      expectedRevision: null,
    });
    expect(imports[1]?.plan).toEqual([
      {
        path: "grouping-definitions/grouping-definitions.md",
        entityType: "grouping-definitions",
        id: "grouping-definitions",
        expectedRevision: "before-sync",
      },
    ]);
    expect(operations.at(-1)?.type).toBe("directory-cleanup");
  });
  test("does not enqueue unguarded work when snapshot capture fails", async () => {
    const service = createMockEntityService();
    spyOn(service, "getEntityWriteSnapshot").mockRejectedValue(
      new Error("Database unavailable"),
    );
    const context = createMockServicePluginContext({ entityService: service });
    const manager = new BatchOperationsManager({
      logger: createSilentLogger(),
      syncPath: "/tmp/import-plan",
      deleteOnFileRemoval: true,
    });
    const failure = await manager
      .queueSyncBatch(context, "test", ["note/a.md"])
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "Database unavailable" });
    expect(context.jobs.enqueueBatch).not.toHaveBeenCalled();
  });
});
