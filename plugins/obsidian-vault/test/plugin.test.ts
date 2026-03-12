import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { createPluginHarness } from "@brains/plugins/test";

import { ObsidianVaultPlugin } from "../src/plugin";

const postSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: z.enum(["draft", "queued", "published"]),
  entityType: z.literal("post"),
  tags: z.array(z.string()).default([]),
});

const noteSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]),
  entityType: z.literal("base"),
});

const siteInfoSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  entityType: z.literal("site-info"),
});

const schemas = new Map<string, z.ZodObject<z.ZodRawShape>>([
  ["post", postSchema],
  ["base", noteSchema],
  ["site-info", siteInfoSchema],
]);

interface MockDeps {
  mkdir: ReturnType<typeof mock>;
  writeFile: ReturnType<typeof mock>;
  existsFile: ReturnType<typeof mock>;
}

function createMockDeps(): MockDeps {
  return {
    mkdir: mock(
      (_path: string, _options?: { recursive: boolean }): void => undefined,
    ),
    writeFile: mock((_path: string, _content: string): void => undefined),
    existsFile: mock((_path: string): boolean => false),
  };
}

describe("ObsidianVaultPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    harness = createPluginHarness({
      dataDir: "/tmp/test-vault",
      logContext: "obsidian-vault-test",
    });

    const shell = harness.getShell();
    const registry = shell.getEntityRegistry();
    registry.registerEntityType("post", {} as never, {} as never);
    registry.registerEntityType("base", {} as never, {} as never);
    registry.registerEntityType("site-info", {} as never, {} as never);
    registry.getEffectiveFrontmatterSchema = (
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined => schemas.get(type);
    registry.getAdapter = (entityType: string): never => {
      if (entityType === "site-info") {
        return {
          isSingleton: true,
          getBodyTemplate: (): string => "",
        } as never;
      }
      return { getBodyTemplate: (): string => "" } as never;
    };
    shell.getEntityRegistry = (): typeof registry => registry;

    const plugin = new ObsidianVaultPlugin({}, deps);
    await harness.installPlugin(plugin);
  });

  it("should register the sync-templates tool", () => {
    const capabilities = harness.getCapabilities();
    const toolNames = capabilities.tools.map((t) => t.name);
    expect(toolNames).toContain("obsidian-vault_sync-templates");
  });

  it("should generate templates for all entity types", async () => {
    const result = await harness.executeTool("obsidian-vault_sync-templates");
    expect(result.success).toBe(true);

    const data = result.data as { generated: string[] };
    expect(data.generated).toContain("post");
    expect(data.generated).toContain("base");
  });

  it("should write template files to the correct directory", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    expect(deps.mkdir).toHaveBeenCalledWith(
      "/tmp/test-vault/_obsidian/templates",
      { recursive: true },
    );

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/templates/post.md");
    expect(paths).toContain("/tmp/test-vault/_obsidian/templates/base.md");
  });

  it("should generate valid template content", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const postCall = writeCalls.find(
      (call) => call[0] === "/tmp/test-vault/_obsidian/templates/post.md",
    );
    expect(postCall).toBeDefined();

    const content = String(postCall?.[1]);
    expect(content).toContain('title: "{{title}}"');
    expect(content).toContain("status: draft");
    expect(content).toContain("entityType: post");
    expect(content).toContain("tags: []");
  });

  it("should filter entity types when specified", async () => {
    const result = await harness.executeTool("obsidian-vault_sync-templates", {
      entityTypes: ["post"],
    });
    expect(result.success).toBe(true);

    const data = result.data as { generated: string[] };
    expect(data.generated).toEqual(["post"]);
    expect(data.generated).not.toContain("base");
  });

  it("should skip entity types with no frontmatter schema", async () => {
    const shell = harness.getShell();
    const registry = shell.getEntityRegistry();
    registry.registerEntityType("image", {} as never, {} as never);

    const result = await harness.executeTool("obsidian-vault_sync-templates");
    expect(result.success).toBe(true);

    const data = result.data as { generated: string[]; skipped: string[] };
    expect(data.skipped).toContain("image");
    expect(data.generated).not.toContain("image");
  });

  it("should write fileClass files to the correct directory", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    expect(deps.mkdir).toHaveBeenCalledWith(
      "/tmp/test-vault/_obsidian/fileClasses",
      { recursive: true },
    );

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/fileClasses/post.md");
    expect(paths).toContain("/tmp/test-vault/_obsidian/fileClasses/base.md");
  });

  it("should generate fileClass with enum options", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const postFileClass = writeCalls.find(
      (call) => call[0] === "/tmp/test-vault/_obsidian/fileClasses/post.md",
    );
    expect(postFileClass).toBeDefined();

    const content = String(postFileClass?.[1]);
    expect(content).toContain("name: status");
    expect(content).toContain("type: Select");
    expect(content).toContain("'0': draft");
    expect(content).toContain("'1': queued");
    expect(content).toContain("'2': published");
  });

  it("should return fileClasses in result data", async () => {
    const result = await harness.executeTool("obsidian-vault_sync-templates");
    expect(result.success).toBe(true);

    const data = result.data as { fileClasses: string[] };
    expect(data.fileClasses).toContain("post");
    expect(data.fileClasses).toContain("base");
  });

  it("should generate .base files at vault root", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/bases/Posts.base");
    expect(paths).toContain("/tmp/test-vault/_obsidian/bases/Notes.base");
  });

  it("should generate Pipeline.base when status fields exist", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/bases/Pipeline.base");
  });

  it("should not overwrite existing .base files", async () => {
    deps.existsFile.mockImplementation(
      (path: string) => path === "/tmp/test-vault/_obsidian/bases/Posts.base",
    );

    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).not.toContain("/tmp/test-vault/_obsidian/bases/Posts.base");
    // Other bases should still be generated
    expect(paths).toContain("/tmp/test-vault/_obsidian/bases/Notes.base");
  });

  it("should return bases in result data", async () => {
    const result = await harness.executeTool("obsidian-vault_sync-templates");
    expect(result.success).toBe(true);

    const data = result.data as { bases: string[] };
    expect(data.bases).toContain("post");
    expect(data.bases).toContain("base");
    expect(data.bases).toContain("Pipeline");
  });

  it("should not generate templates for singleton entity types", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).not.toContain(
      "/tmp/test-vault/_obsidian/templates/site-info.md",
    );
  });

  it("should still generate fileClasses for singleton entity types", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain(
      "/tmp/test-vault/_obsidian/fileClasses/site-info.md",
    );
  });

  it("should not generate individual .base for singleton entity types", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    // No individual Site Infos.base
    expect(
      paths.some(
        (p) =>
          typeof p === "string" &&
          p.includes("bases/") &&
          p.includes("Site Info"),
      ),
    ).toBe(false);
  });

  it("should generate Settings.base grouping all singletons", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/bases/Settings.base");
  });

  it("should not include singletons in generated list", async () => {
    const result = await harness.executeTool("obsidian-vault_sync-templates");
    const data = result.data as { generated: string[] };
    expect(data.generated).not.toContain("site-info");
  });
});
