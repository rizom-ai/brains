import { describe, it, expect, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  removeOrphanedEntities,
  type CleanupPipelineDeps,
} from "../src/lib/cleanup-pipeline";
import { createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";

function createMockDeps(
  overrides: Partial<{
    entities: Record<string, BaseEntity[]>;
    existingFiles: Set<string>;
    deleteOnFileRemoval: boolean;
  }> = {},
): CleanupPipelineDeps {
  const entities = overrides.entities ?? {};
  const existingFiles = overrides.existingFiles ?? new Set<string>();
  const deleteOnFileRemoval = overrides.deleteOnFileRemoval ?? true;

  return {
    entityService: {
      getEntityTypes: () => Object.keys(entities),
      listEntities: mock(async (request: { entityType: string }) => {
        return entities[request.entityType] ?? [];
      }),
      deleteEntity: mock(async () => true),
    },
    logger: createSilentLogger(),
    fileOperations: {
      getEntityFilePath: (entity: BaseEntity) =>
        `/data/${entity.entityType}/${entity.id}.md`,
      fileExists: (filePath: string) =>
        Promise.resolve(existingFiles.has(filePath)),
    },
    deleteOnFileRemoval,
  };
}

describe("removeOrphanedEntities", () => {
  it("should delete DB entities whose files no longer exist on disk", async () => {
    const orphan = createTestEntity("social-post", { id: "deleted-post" });
    const deps = createMockDeps({
      entities: { "social-post": [orphan] },
      existingFiles: new Set(), // no files on disk
    });

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(1);
    expect(deps.entityService.deleteEntity).toHaveBeenCalledWith(
      "social-post",
      "deleted-post",
    );
  });

  it("should not delete entities that still have files on disk", async () => {
    const existing = createTestEntity("social-post", { id: "existing-post" });
    const deps = createMockDeps({
      entities: { "social-post": [existing] },
      existingFiles: new Set(["/data/social-post/existing-post.md"]),
    });

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(0);
    expect(deps.entityService.deleteEntity).not.toHaveBeenCalled();
  });

  it("should skip cleanup when deleteOnFileRemoval is false", async () => {
    const orphan = createTestEntity("social-post", { id: "orphan" });
    const deps = createMockDeps({
      entities: { "social-post": [orphan] },
      existingFiles: new Set(), // file missing
      deleteOnFileRemoval: false,
    });

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(0);
    expect(deps.entityService.deleteEntity).not.toHaveBeenCalled();
  });

  it("should handle multiple entity types", async () => {
    const orphanPost = createTestEntity("social-post", { id: "old-post" });
    const orphanBlog = createTestEntity("blog-post", { id: "old-blog" });
    const survivingPost = createTestEntity("social-post", {
      id: "surviving-post",
    });

    const deps = createMockDeps({
      entities: {
        "social-post": [orphanPost, survivingPost],
        "blog-post": [orphanBlog],
      },
      existingFiles: new Set(["/data/social-post/surviving-post.md"]),
    });

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(2);
    expect(deps.entityService.deleteEntity).toHaveBeenCalledTimes(2);
  });

  it("should report errors when deletion fails", async () => {
    const orphan = createTestEntity("social-post", { id: "fail-delete" });
    const deps = createMockDeps({
      entities: { "social-post": [orphan] },
      existingFiles: new Set(),
    });

    (
      deps.entityService.deleteEntity as ReturnType<typeof mock>
    ).mockRejectedValue(new Error("DB connection lost"));

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.entityId).toBe("fail-delete");
    expect(result.errors[0]?.error).toContain("DB connection lost");
  });

  it("should use configured entityTypes when provided", async () => {
    const post = createTestEntity("social-post", { id: "post-1" });
    const blog = createTestEntity("blog-post", { id: "blog-1" });

    const deps = createMockDeps({
      entities: {
        "social-post": [post],
        "blog-post": [blog],
      },
      existingFiles: new Set(), // both orphaned
    });
    // Override to only sync social-post
    deps.entityTypes = ["social-post"];

    const result = await removeOrphanedEntities(deps);

    expect(result.deleted).toBe(1);
    expect(deps.entityService.deleteEntity).toHaveBeenCalledWith(
      "social-post",
      "post-1",
    );
    // blog-post should not be touched
    expect(deps.entityService.listEntities).not.toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "blog-post" }),
    );
  });
});
