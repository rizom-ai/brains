import { describe, expect, test, spyOn } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { BatchOperationsManager } from "../src/lib/batch-operations";
import { directoryImportJobSchema } from "../src/types/jobs";
import { DirectorySync } from "../src/lib/directory-sync";
import { captureImportPlan } from "../src/lib/import-plan";
import { parseEntityPath } from "../src/lib/entity-paths";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    const service = createMockEntityService({
      entityTypes: ["note", "grouping-definitions"],
    });
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
  test("names the entity types the scheduler admitted on each import job", async () => {
    // A worker of another build can claim the job: during a rolling deploy
    // the old container's worker shares the job queue. It must be able to
    // tell that it cannot import what this process admitted.
    const service = createMockEntityService({ entityTypes: ["doc", "guide"] });
    const context = createMockServicePluginContext({ entityService: service });
    const manager = new BatchOperationsManager({
      logger: createSilentLogger(),
      syncPath: "/tmp/import-plan",
      deleteOnFileRemoval: true,
    });

    await manager.queueSyncBatch(context, "test", [
      "doc/a.md",
      "guide/writer.md",
      "guide/team.md",
      "README.md",
    ]);

    const operations = context.jobs.enqueueBatch.mock.calls[0]?.[0] ?? [];
    const imports = operations
      .filter((operation) => operation.type === "directory-import")
      .map((operation) =>
        directoryImportJobSchema.parse(
          JSON.parse(JSON.stringify(operation.data)),
        ),
      );
    // README.md maps to note, which this brain does not register: the
    // import skips it as before, so it is not a type the job requires.
    expect(imports[0]?.entityTypes).toEqual(["doc", "guide"]);
  });
  test("does not enqueue unguarded work when snapshot capture fails", async () => {
    const service = createMockEntityService({ entityTypes: ["note"] });
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
  test("never receives a file of an unregistered type from a queued sync", async () => {
    // While plugins register, types composed after directory-sync are not
    // registered yet. File discovery leaves their files out, so the plan
    // never reads an entity through a type that cannot parse it.
    const syncPath = mkdtempSync(join(tmpdir(), "test-import-plan-types-"));
    try {
      mkdirSync(join(syncPath, "note"), { recursive: true });
      mkdirSync(join(syncPath, "widget"), { recursive: true });
      writeFileSync(join(syncPath, "note", "a.md"), "A note\n");
      writeFileSync(join(syncPath, "widget", "legacy.md"), "Widget\n");
      const service = createMockEntityService({ entityTypes: ["note"] });
      const read = spyOn(service, "getEntityWriteSnapshot").mockResolvedValue(
        null,
      );
      const context = createMockServicePluginContext({
        entityService: service,
      });
      const directorySync = new DirectorySync({
        syncPath,
        entityService: service,
        logger: createSilentLogger(),
      });

      expect(
        await directorySync.queueSyncBatch(context, "test", undefined, [
          "widget/legacy.md",
        ]),
      ).toBeNull();
      expect(context.jobs.enqueueBatch).not.toHaveBeenCalled();

      await directorySync.queueSyncBatch(context, "test", undefined, [
        "note/a.md",
        "widget/legacy.md",
      ]);
      const operations = context.jobs.enqueueBatch.mock.calls[0]?.[0] ?? [];
      const plans = operations
        .filter((operation) => operation.type === "directory-import")
        .flatMap(
          (operation) =>
            directoryImportJobSchema.parse(
              JSON.parse(JSON.stringify(operation.data)),
            ).plan ?? [],
        );
      expect(plans.map((entry) => entry.path)).toEqual(["note/a.md"]);
      expect(read.mock.calls.map(([request]) => request.entityType)).toEqual([
        "note",
      ]);
    } finally {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });
  test("admits a file of an unregistered type as a create without reading its entity", async () => {
    // A stored entity of a type with no adapter cannot be read back, so the
    // plan does not try: the file may only create its entity. An import that
    // finds one stored skips the file as stale rather than overwrite it.
    const service = createMockEntityService({ entityTypes: ["note"] });
    const read = spyOn(service, "getEntityWriteSnapshot").mockImplementation(
      async (request) => {
        if (request.entityType !== "note") {
          throw new Error(
            `Unknown entity type ${request.entityType}: no adapter registered`,
          );
        }
        return { entity: { ...entity, entityType: "note" }, revision: "r1" };
      },
    );

    const plan = await captureImportPlan(
      service,
      {
        parseEntityFromPath: (path) =>
          parseEntityPath("/sync", path, new Map()),
      },
      ["note/a.md", "widget/legacy.md"],
    );

    expect(plan).toEqual([
      {
        path: "note/a.md",
        entityType: "note",
        id: "a",
        expectedRevision: "r1",
      },
      {
        path: "widget/legacy.md",
        entityType: "widget",
        id: "legacy",
        expectedRevision: null,
      },
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
