import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { z } from "@brains/utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { execSync } from "child_process";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "base";
  public readonly schema = baseEntitySchema;

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }

  toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    return {};
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}

/**
 * Regression test: Seed content should NOT overwrite git-synced data
 *
 * This test ensures that when a git repository with a remote is present,
 * the seed-content is not copied even if the directory appears "empty"
 * (only contains .git directory). This prevents the scenario where:
 *
 * 1. Git-sync clones a repo (creates .git)
 * 2. Git-sync hasn't pulled yet (waiting for plugins:ready)
 * 3. Directory-sync sees "empty" directory and copies seed-content
 * 4. Git-sync pulls and causes conflicts or seed-content overwrites real data
 */
describe("Seed Content Git Detection", () => {
  let testDir: string;
  let brainDataPath: string;
  let seedContentPath: string;

  beforeEach(() => {
    // Create temporary test directories
    testDir = join(tmpdir(), `test-seed-git-${Date.now()}`);
    brainDataPath = join(testDir, "brain-data");
    seedContentPath = join(testDir, "seed-content");

    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("isBrainDataEmpty with git repository", () => {
    it("should NOT copy seed content when .git exists with a remote", async () => {
      // Setup: Create brain-data with a git repo that has a remote
      mkdirSync(brainDataPath, { recursive: true });

      // Initialize git repo with a remote
      execSync("git init", { cwd: brainDataPath, stdio: "ignore" });
      execSync("git remote add origin https://github.com/example/repo.git", {
        cwd: brainDataPath,
        stdio: "ignore",
      });

      // Create seed content
      mkdirSync(seedContentPath, { recursive: true });
      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "test-post.md"),
        "---\ntitle: Seed Post\n---\nThis is seed content that should NOT be copied.",
      );

      // Create harness and plugin
      const harness = createPluginHarness<DirectorySyncPlugin>({
        dataDir: brainDataPath,
      });

      const shell = harness.getShell();
      const entityRegistry = shell.getEntityRegistry();
      entityRegistry.registerEntityType(
        "post",
        baseEntitySchema,
        new MockEntityAdapter(),
      );

      // Change to testDir so seed-content is found relative to cwd
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const plugin = new DirectorySyncPlugin({
          syncPath: brainDataPath,
          autoSync: false,
          initialSync: true, // Need initialSync to trigger system:plugins:ready handler
          seedContent: true,
        });

        await harness.installPlugin(plugin);

        // Emit system:plugins:ready to trigger seed content check
        await harness.sendMessage("system:plugins:ready", {}, "test");

        // Verify: seed content should NOT have been copied
        const postDir = join(brainDataPath, "post");
        const postExists = existsSync(join(postDir, "test-post.md"));

        expect(postExists).toBe(false);
      } finally {
        process.chdir(originalCwd);
        harness.reset();
      }
    });

    it("should copy seed content when no .git directory exists", async () => {
      // Setup: Create empty brain-data (no git)
      mkdirSync(brainDataPath, { recursive: true });

      // Create seed content
      mkdirSync(seedContentPath, { recursive: true });
      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "test-post.md"),
        "---\ntitle: Seed Post\n---\nThis seed content SHOULD be copied.",
      );

      // Create harness and plugin
      const harness = createPluginHarness<DirectorySyncPlugin>({
        dataDir: brainDataPath,
      });

      const shell = harness.getShell();
      const entityRegistry = shell.getEntityRegistry();
      entityRegistry.registerEntityType(
        "post",
        baseEntitySchema,
        new MockEntityAdapter(),
      );

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const plugin = new DirectorySyncPlugin({
          syncPath: brainDataPath,
          autoSync: false,
          initialSync: true, // Need initialSync to trigger system:plugins:ready handler
          seedContent: true,
        });

        await harness.installPlugin(plugin);

        // Emit system:plugins:ready to trigger seed content check
        await harness.sendMessage("system:plugins:ready", {}, "test");

        // Verify: seed content SHOULD have been copied
        const postPath = join(brainDataPath, "post", "test-post.md");
        expect(existsSync(postPath)).toBe(true);

        const content = readFileSync(postPath, "utf-8");
        expect(content).toContain("SHOULD be copied");
      } finally {
        process.chdir(originalCwd);
        harness.reset();
      }
    });

    it("should copy seed content when .git exists but has NO remote", async () => {
      // Setup: Create brain-data with git but no remote (local-only repo)
      mkdirSync(brainDataPath, { recursive: true });

      // Initialize git repo WITHOUT a remote
      execSync("git init", { cwd: brainDataPath, stdio: "ignore" });

      // Create seed content
      mkdirSync(seedContentPath, { recursive: true });
      mkdirSync(join(seedContentPath, "note"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "note", "test-note.md"),
        "---\ntitle: Seed Note\n---\nLocal-only repo should get seed content.",
      );

      // Create harness and plugin
      const harness = createPluginHarness<DirectorySyncPlugin>({
        dataDir: brainDataPath,
      });

      const shell = harness.getShell();
      const entityRegistry = shell.getEntityRegistry();
      entityRegistry.registerEntityType(
        "note",
        baseEntitySchema,
        new MockEntityAdapter(),
      );

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const plugin = new DirectorySyncPlugin({
          syncPath: brainDataPath,
          autoSync: false,
          initialSync: true, // Need initialSync to trigger system:plugins:ready handler
          seedContent: true,
        });

        await harness.installPlugin(plugin);

        // Emit system:plugins:ready to trigger seed content check
        await harness.sendMessage("system:plugins:ready", {}, "test");

        // Verify: seed content SHOULD be copied for local-only repos
        const notePath = join(brainDataPath, "note", "test-note.md");
        expect(existsSync(notePath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
        harness.reset();
      }
    });

    it("should NOT copy seed content when brain-data has actual content files", async () => {
      // Setup: Create brain-data with existing content
      mkdirSync(brainDataPath, { recursive: true });
      mkdirSync(join(brainDataPath, "post"), { recursive: true });
      writeFileSync(
        join(brainDataPath, "post", "existing-post.md"),
        "---\ntitle: Existing Post\n---\nThis is existing content.",
      );

      // Create seed content (different from existing)
      mkdirSync(seedContentPath, { recursive: true });
      mkdirSync(join(seedContentPath, "post"), { recursive: true });
      writeFileSync(
        join(seedContentPath, "post", "seed-post.md"),
        "---\ntitle: Seed Post\n---\nThis should NOT be copied.",
      );

      // Create harness and plugin
      const harness = createPluginHarness<DirectorySyncPlugin>({
        dataDir: brainDataPath,
      });

      const shell = harness.getShell();
      const entityRegistry = shell.getEntityRegistry();
      entityRegistry.registerEntityType(
        "post",
        baseEntitySchema,
        new MockEntityAdapter(),
      );

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const plugin = new DirectorySyncPlugin({
          syncPath: brainDataPath,
          autoSync: false,
          initialSync: true, // Need initialSync to trigger system:plugins:ready handler
          seedContent: true,
        });

        await harness.installPlugin(plugin);

        // Emit system:plugins:ready to trigger seed content check
        await harness.sendMessage("system:plugins:ready", {}, "test");

        // Verify: seed content should NOT have been copied
        const seedPostPath = join(brainDataPath, "post", "seed-post.md");
        expect(existsSync(seedPostPath)).toBe(false);

        // Original content should still exist
        const existingPostPath = join(
          brainDataPath,
          "post",
          "existing-post.md",
        );
        expect(existsSync(existingPostPath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
        harness.reset();
      }
    });
  });
});
