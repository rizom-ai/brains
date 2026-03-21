import { describe, it, expect, mock } from "bun:test";
import { createGitTools } from "../../src/tools/git-tools";
import type { GitSync, GitSyncStatus } from "../../src/lib/git-sync";
import type { ToolContext } from "@brains/plugins";

const testToolContext: ToolContext = {
  interfaceType: "test",
  userId: "test-user",
};

const mockStatus: GitSyncStatus = {
  isRepo: true,
  hasChanges: true,
  ahead: 1,
  behind: 0,
  branch: "main",
  lastCommit: "abc123",
  remote: "https://github.com/test/repo.git",
  files: [{ path: "post/hello.md", status: "M " }],
};

function createMockGitSync(): GitSync {
  return {
    pull: mock(async () => ({ files: [] })),
    commit: mock(async () => {}),
    push: mock(async () => {}),
    initialize: mock(async () => {}),
    hasRemote: (): boolean => true,
    getStatus: mock(async () => mockStatus),
    cleanup: (): void => {},
  } as unknown as GitSync;
}

describe("createGitTools", () => {
  it("should return two tools", () => {
    const gs = createMockGitSync();
    const tools = createGitTools(gs, "directory-sync");
    expect(tools).toHaveLength(2);
  });

  it("should have a git_sync tool", () => {
    const gs = createMockGitSync();
    const tools = createGitTools(gs, "directory-sync");
    const syncTool = tools.find((t) => t.name === "directory-sync_git_sync");
    expect(syncTool).toBeDefined();
  });

  it("should have a git_status tool", () => {
    const gs = createMockGitSync();
    const tools = createGitTools(gs, "directory-sync");
    const statusTool = tools.find(
      (t) => t.name === "directory-sync_git_status",
    );
    expect(statusTool).toBeDefined();
  });

  it("git_status should return repo status", async () => {
    const gs = createMockGitSync();
    const tools = createGitTools(gs, "directory-sync");
    const statusTool = tools.find(
      (t) => t.name === "directory-sync_git_status",
    );

    const result = await statusTool?.handler({}, testToolContext);
    expect(result).toMatchObject({
      success: true,
      data: {
        isRepo: true,
        hasChanges: true,
        branch: "main",
      },
    });
  });

  it("git_sync should trigger commit and push", async () => {
    const gs = createMockGitSync();
    const tools = createGitTools(gs, "directory-sync");
    const syncTool = tools.find((t) => t.name === "directory-sync_git_sync");

    const result = await syncTool?.handler({}, testToolContext);
    expect(result).toMatchObject({ success: true });
    expect(gs.commit).toHaveBeenCalled();
    expect(gs.push).toHaveBeenCalled();
  });
});
