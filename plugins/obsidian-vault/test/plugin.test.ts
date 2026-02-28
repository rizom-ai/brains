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

const schemas = new Map<string, z.ZodObject<z.ZodRawShape>>([
  ["post", postSchema],
  ["base", noteSchema],
]);

function createMockDeps() {
  return {
    mkdir: mock(
      (_path: string, _options?: { recursive: boolean }) => undefined,
    ),
    writeFile: mock((_path: string, _content: string) => undefined),
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

    // Set up entity types BEFORE installPlugin so the context captures them.
    // getEntityRegistry() returns a new object each call, so we patch
    // the shell method to return a consistent object with our schema override.
    const shell = harness.getShell();
    const registry = shell.getEntityRegistry();
    registry.registerEntityType("post", {} as never, {} as never);
    registry.registerEntityType("base", {} as never, {} as never);
    registry.getEffectiveFrontmatterSchema = (type: string) =>
      schemas.get(type);
    shell.getEntityRegistry = () => registry;

    const plugin = new ObsidianVaultPlugin(
      { templateFolder: "templates" },
      deps,
    );
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

    expect(deps.mkdir).toHaveBeenCalledWith("/tmp/test-vault/templates", {
      recursive: true,
    });

    const writeCalls = deps.writeFile.mock.calls;
    const paths = writeCalls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/templates/post.md");
    expect(paths).toContain("/tmp/test-vault/templates/base.md");
  });

  it("should generate valid template content", async () => {
    await harness.executeTool("obsidian-vault_sync-templates");

    const writeCalls = deps.writeFile.mock.calls;
    const postCall = writeCalls.find(
      (call) => call[0] === "/tmp/test-vault/templates/post.md",
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
});
