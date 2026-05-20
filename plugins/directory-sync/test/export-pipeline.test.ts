import { describe, it, expect, mock } from "bun:test";
import {
  exportEntities,
  type ExportPipelineDeps,
} from "../src/lib/export-pipeline";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";

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
    },
    deleteOnFileRemoval: false,
    entityTypes: Object.keys(entities),
  };
  return deps;
}

describe("exportEntities visibility", () => {
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
