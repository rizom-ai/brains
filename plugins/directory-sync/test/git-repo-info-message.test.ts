import { describe, it, expect } from "bun:test";
import { directorySyncSubscriptions } from "../src/lib/message-handlers";
import { createSilentLogger } from "@brains/test-utils";
import { installSubscriptions } from "./helpers/install";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { SyncHandlerSource } from "../src/lib/message-handlers";
import { MockEntityAdapter } from "./fixtures";

/**
 * Regression test: git-sync:get-repo-info message was lost during
 * the git-sync merge into directory-sync. The site-builder Studio needs
 * this message to generate /admin/ config.yml with the correct repo.
 */
describe("git-sync:get-repo-info message handler", () => {
  /** A sync member the repo-info handler never calls: reaching it is the failure. */
  const notCalled =
    (name: string): (() => never) =>
    () => {
      throw new Error(`${name} is not stubbed in this test`);
    };

  // The repo-info handler consumes none of these, but it gets a real
  // SyncHandlerSource rather than an empty object asserted into one — so a
  // member added to the interface fails here.
  const stubDs: SyncHandlerSource = {
    getStatus: notCalled("getStatus"),
    exportEntities: notCalled("exportEntities"),
    importEntities: notCalled("importEntities"),
    removeOrphanedEntities: notCalled("removeOrphanedEntities"),
  };

  async function setup(gitConfig?: {
    repo?: string;
    branch?: string;
  }): Promise<ReturnType<typeof createPluginHarness>> {
    const harness = createPluginHarness({ dataDir: "/tmp/test-repo-info" });
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
    await installSubscriptions(
      harness.getMockShell(),
      directorySyncSubscriptions({
        getDirectorySync: () => stubDs,
        configure: async () => {},
        logger: createSilentLogger("repo-info"),
        gitConfig,
      }),
    );
    return harness;
  }

  it("should return repo and branch when git is configured", async () => {
    const harness = await setup({
      repo: "your-org/test-content",
      branch: "main",
    });

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeDefined();
    expect(result?.repo).toBe("your-org/test-content");
    expect(result?.branch).toBe("main");

    await harness.reset();
  });

  it("should return undefined when git is not configured", async () => {
    const harness = await setup();

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeUndefined();

    await harness.reset();
  });

  it("should default branch to main when not specified", async () => {
    const harness = await setup({ repo: "your-org/test-content" });

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeDefined();
    expect(result?.branch).toBe("main");

    await harness.reset();
  });
});
