import { describe, it, expect } from "bun:test";
import { registerMessageHandlers } from "../src/lib/message-handlers";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { DirectorySync } from "../src/lib/directory-sync";
import { MockEntityAdapter } from "./fixtures";

/**
 * Regression test: git-sync:get-repo-info message was lost during
 * the git-sync merge into directory-sync. The site-builder CMS needs
 * this message to generate /admin/ config.yml with the correct repo.
 */
describe("git-sync:get-repo-info message handler", () => {
  // The repo-info handler doesn't use DirectorySync, so a stub suffices
  const stubDs = {} as DirectorySync;

  function setup(gitConfig?: {
    repo?: string;
    branch?: string;
  }): ReturnType<typeof createPluginHarness> {
    const harness = createPluginHarness({ dataDir: "/tmp/test-repo-info" });
    harness
      .getEntityRegistry()
      .registerEntityType("base", baseEntitySchema, new MockEntityAdapter());

    const context = harness.getServiceContext("directory-sync");

    registerMessageHandlers(
      context,
      () => stubDs,
      async () => {},
      context.logger,
      gitConfig,
    );

    return harness;
  }

  it("should return repo and branch when git is configured", async () => {
    const harness = setup({ repo: "your-org/test-content", branch: "main" });

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeDefined();
    expect(result?.repo).toBe("your-org/test-content");
    expect(result?.branch).toBe("main");

    harness.reset();
  });

  it("should return undefined when git is not configured", async () => {
    const harness = setup();

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeUndefined();

    harness.reset();
  });

  it("should default branch to main when not specified", async () => {
    const harness = setup({ repo: "your-org/test-content" });

    const result = await harness.sendMessage<
      Record<string, never>,
      { repo: string; branch: string }
    >("git-sync:get-repo-info", {});

    expect(result).toBeDefined();
    expect(result?.branch).toBe("main");

    harness.reset();
  });
});
