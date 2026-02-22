import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { MockEntityAdapter } from "./fixtures";

describe("Seed Content Git Detection", () => {
  let testDir: string;
  let brainDataPath: string;
  let seedContentPath: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-seed-git-${Date.now()}`);
    brainDataPath = join(testDir, "brain-data");
    seedContentPath = join(testDir, "seed-content");
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Sets up harness, registers an entity type, installs the plugin,
   * emits system:plugins:ready, and cleans up afterward.
   */
  async function installAndTriggerReady(entityType: string): Promise<void> {
    const harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: brainDataPath,
    });

    const entityRegistry = harness.getShell().getEntityRegistry();
    entityRegistry.registerEntityType(
      entityType,
      baseEntitySchema,
      new MockEntityAdapter(),
    );

    process.chdir(testDir);

    const plugin = new DirectorySyncPlugin({
      syncPath: brainDataPath,
      autoSync: false,
      initialSync: true,
      seedContent: true,
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "test");
    harness.reset();
  }

  describe("isBrainDataEmpty with git repository", () => {
    it("should NOT copy seed content when .git exists with a remote", async () => {
      mkdirSync(brainDataPath, { recursive: true });
      execSync("git init", { cwd: brainDataPath, stdio: "ignore" });
      execSync("git remote add origin https://github.com/example/repo.git", {
        cwd: brainDataPath,
        stdio: "ignore",
      });

      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "test-post.md"),
        "---\ntitle: Seed Post\n---\nThis is seed content that should NOT be copied.",
      );

      await installAndTriggerReady("post");

      expect(existsSync(join(brainDataPath, "post", "test-post.md"))).toBe(
        false,
      );
    });

    it("should copy seed content when no .git directory exists", async () => {
      mkdirSync(brainDataPath, { recursive: true });

      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "test-post.md"),
        "---\ntitle: Seed Post\n---\nThis seed content SHOULD be copied.",
      );

      await installAndTriggerReady("post");

      const postPath = join(brainDataPath, "post", "test-post.md");
      expect(existsSync(postPath)).toBe(true);

      const content = readFileSync(postPath, "utf-8");
      expect(content).toContain("SHOULD be copied");
    });

    it("should copy seed content when .git exists but has NO remote", async () => {
      mkdirSync(brainDataPath, { recursive: true });
      execSync("git init", { cwd: brainDataPath, stdio: "ignore" });

      mkdirSync(join(seedContentPath, "note"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "note", "test-note.md"),
        "---\ntitle: Seed Note\n---\nLocal-only repo should get seed content.",
      );

      await installAndTriggerReady("note");

      expect(existsSync(join(brainDataPath, "note", "test-note.md"))).toBe(
        true,
      );
    });

    it("should NOT copy seed content when brain-data has actual content files", async () => {
      mkdirSync(join(brainDataPath, "post"), { recursive: true });
      writeFileSync(
        join(brainDataPath, "post", "existing-post.md"),
        "---\ntitle: Existing Post\n---\nThis is existing content.",
      );

      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "seed-post.md"),
        "---\ntitle: Seed Post\n---\nThis should NOT be copied.",
      );

      await installAndTriggerReady("post");

      expect(existsSync(join(brainDataPath, "post", "seed-post.md"))).toBe(
        false,
      );
      expect(existsSync(join(brainDataPath, "post", "existing-post.md"))).toBe(
        true,
      );
    });
  });
});
