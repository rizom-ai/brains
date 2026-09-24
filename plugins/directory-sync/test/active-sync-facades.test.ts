import { describe, expect, it, mock, spyOn } from "bun:test";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  createDirectorySyncFacade,
  createGitSyncFacade,
} from "../src/lib/active-sync-facades";
import { createMockDirectorySync, createMockGitSync } from "./fixtures";
import type { IDirectorySync } from "../src/types";

function directoryAt(syncPath: string): IDirectorySync {
  return createMockDirectorySync({
    getStatus: mock(async () => ({
      syncPath,
      exists: true,
      watching: false,
      files: [],
      stats: { totalFiles: 0, byEntityType: {} },
    })),
  });
}

describe("active sync facades", () => {
  it("resolves the active directory generation for every call", async () => {
    let active = directoryAt("/first");
    const facade = createDirectorySyncFacade(() => active);

    expect((await facade.getStatus()).syncPath).toBe("/first");
    active = directoryAt("/second");
    expect((await facade.getStatus()).syncPath).toBe("/second");
  });

  it("forwards durable batch identity through the active generation", async () => {
    const active = directoryAt("/batch");
    const imported = spyOn(active, "importEntitiesWithProgress");
    const cleaned = spyOn(active, "removeOrphanedEntities");
    const facade = createDirectorySyncFacade(() => active);
    const batch = {
      operationId: "root",
      rootJobId: "root",
      childKey: "child",
      expectedChildren: 2,
    };
    const reporter = createMockProgressReporter();
    await facade.importEntitiesWithProgress(["note.md"], reporter, 10, batch);
    await facade.removeOrphanedEntities(batch);
    expect(imported).toHaveBeenCalledWith(["note.md"], reporter, 10, batch);
    expect(cleaned).toHaveBeenCalledWith(batch);
  });

  it("resolves the active Git generation and forwards cancellation", async () => {
    const firstPull = mock(async () => ({ files: ["first.md"] }));
    const secondPull = mock(async (signal?: AbortSignal) => {
      signal?.throwIfAborted();
      return { files: ["second.md"] };
    });
    let active = createMockGitSync({ pull: firstPull });
    const facade = createGitSyncFacade(() => active);

    expect(await facade.pull()).toEqual({ files: ["first.md"] });
    active = createMockGitSync({ pull: secondPull });
    const controller = new AbortController();
    expect(await facade.pull(controller.signal)).toEqual({
      files: ["second.md"],
    });
    expect(secondPull).toHaveBeenCalledWith(controller.signal);
  });
});
