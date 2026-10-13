import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, mock } from "bun:test";
import {
  exportEntities,
  type ExportPipelineDeps,
} from "../src/lib/export-pipeline";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { EntityPlacementError } from "../src/lib/entity-placement-error";

function createMockDeps(
  overrides: Partial<{
    entities: Record<string, BaseEntity[]>;
  }> = {},
): ExportPipelineDeps {
  const entities = overrides.entities ?? {};
  const listEntities = mock(
    async (
      request: Parameters<
        ExportPipelineDeps["entityService"]["listEntities"]
      >[0],
    ) => entities[request.entityType] ?? [],
  );
  const deps: ExportPipelineDeps = {
    entityService: {
      listEntities,
      deleteEntity: mock(async () => true),
      getEntityTypes: () => Object.keys(entities),
    },
    logger: createSilentLogger(),
    fileOperations: {
      getEntityFilePath: (entity: BaseEntity) =>
        `/data/${entity.entityType}/${entity.id}.md`,
      fileExists: () => Promise.resolve(true),
      writeEntity: mock(async () => {}),
      assertEntityPlacement: () => {},
    },
    deleteOnFileRemoval: false,
    entityTypes: Object.keys(entities),
  };
  return deps;
}

describe("exportEntities visibility", () => {
  it("reports a refused placement without interpreting a missing file as deletion", async () => {
    const entity = createTestEntity("note", { id: "book:intro" });
    const deps = createMockDeps({ entities: { note: [entity] } });
    deps.deleteOnFileRemoval = true;
    deps.fileOperations.fileExists = mock(async () => false);
    deps.fileOperations.assertEntityPlacement = (): never => {
      throw new EntityPlacementError("note", entity.id, "book/intro.md", {
        entityType: "book",
        id: "intro",
      });
    };
    const result = await exportEntities(deps);
    expect(result.failed).toBe(1);
    expect(deps.fileOperations.fileExists).not.toHaveBeenCalled();
    expect(deps.fileOperations.writeEntity).not.toHaveBeenCalled();
    expect(deps.entityService.deleteEntity).not.toHaveBeenCalled();
  });
  it("lists entities across all visibility tiers (sync is system-internal)", async () => {
    const note = createTestEntity("note", { id: "n1" });
    const deps = createMockDeps({ entities: { note: [note] } });

    await exportEntities(deps);

    expect(deps.entityService.listEntities).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "note",
        options: expect.objectContaining({
          filter: expect.objectContaining({
            visibilityScope: "restricted",
          }),
        }),
      }),
    );
  });
});
