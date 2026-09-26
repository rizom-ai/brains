import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  baseEntitySchema,
  type EntityAdapter,
  type BaseEntity,
} from "@brains/plugins";
import {
  obsidianVault,
  syncObsidianArtifacts,
  type ObsidianSyncReport,
} from "../src/plugin";
import packageJson from "../package.json";

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
  entityType: z.literal("note"),
});

const siteInfoSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  entityType: z.literal("site-info"),
});

const schemas = new Map<string, z.ZodObject<z.ZodRawShape>>([
  ["post", postSchema],
  ["note", noteSchema],
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

const shapes = {
  frontmatterSchema: (type: string): z.ZodObject<z.ZodRawShape> | undefined =>
    schemas.get(type),
  isSingleton: (type: string): boolean => type === "site-info",
  bodyTemplate: (): string => "",
};

describe("syncObsidianArtifacts", () => {
  let deps: MockDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  function runSync(entityTypes: string[]): ObsidianSyncReport {
    return syncObsidianArtifacts({
      entityTypes,
      shapes,
      dataDir: "/tmp/test-vault",
      config: { baseFolder: "_obsidian" },
      deps,
      log: () => undefined,
    });
  }

  function writtenPaths(): unknown[] {
    return deps.writeFile.mock.calls.map((call) => call[0]);
  }

  it("generates templates for all entity types", () => {
    const report = runSync(["post", "note", "site-info"]);
    expect(report.generated).toContain("post");
    expect(report.generated).toContain("note");
  });

  it("renders only the requested types", () => {
    const report = runSync(["post"]);
    expect(report.generated).toEqual(["post"]);
  });

  it("skips entity types with no frontmatter schema", () => {
    const report = runSync(["post", "image"]);
    expect(report.skipped).toContain("image");
    expect(report.generated).not.toContain("image");
  });

  it("writes template files to the correct directory", () => {
    runSync(["post", "note"]);
    expect(deps.mkdir).toHaveBeenCalledWith(
      "/tmp/test-vault/_obsidian/templates",
      { recursive: true },
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/templates/post.md",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/templates/note.md",
    );
  });

  it("generates valid template content", () => {
    runSync(["post"]);
    const postCall = deps.writeFile.mock.calls.find(
      (call) => call[0] === "/tmp/test-vault/_obsidian/templates/post.md",
    );
    const content = String(postCall?.[1]);
    expect(content).toContain('title: "{{title}}"');
    expect(content).toContain("status: draft");
    expect(content).toContain("entityType: post");
    expect(content).toContain("tags: []");
  });

  it("writes fileClass files with enum options", () => {
    const report = runSync(["post", "note"]);
    expect(report.fileClasses).toContain("post");
    expect(report.fileClasses).toContain("note");
    const postFileClass = deps.writeFile.mock.calls.find(
      (call) => call[0] === "/tmp/test-vault/_obsidian/fileClasses/post.md",
    );
    const content = String(postFileClass?.[1]);
    expect(content).toContain("name: status");
    expect(content).toContain("type: Select");
    expect(content).toContain("'0': draft");
    expect(content).toContain("'1': queued");
    expect(content).toContain("'2': published");
  });

  it("generates .base files, Pipeline included, and reports them", () => {
    const report = runSync(["post", "note"]);
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/bases/Posts.base",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/bases/Notes.base",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/bases/Pipeline.base",
    );
    expect(report.bases).toContain("post");
    expect(report.bases).toContain("note");
    expect(report.bases).toContain("Pipeline");
  });

  it("never overwrites an existing .base file", () => {
    deps.existsFile.mockImplementation(
      (path: string) => path === "/tmp/test-vault/_obsidian/bases/Posts.base",
    );
    runSync(["post", "note"]);
    expect(writtenPaths()).not.toContain(
      "/tmp/test-vault/_obsidian/bases/Posts.base",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/bases/Notes.base",
    );
  });

  it("treats singletons as fileClasses plus Settings.base, never templates", () => {
    const report = runSync(["post", "site-info"]);
    expect(writtenPaths()).not.toContain(
      "/tmp/test-vault/_obsidian/templates/site-info.md",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/fileClasses/site-info.md",
    );
    expect(writtenPaths()).toContain(
      "/tmp/test-vault/_obsidian/bases/Settings.base",
    );
    expect(
      writtenPaths().some(
        (path) =>
          typeof path === "string" &&
          path.includes("bases/") &&
          path.includes("Site Info"),
      ),
    ).toBe(false);
    expect(report.generated).not.toContain("site-info");
  });
});

describe("obsidian-vault service", () => {
  function installVault(deps: MockDeps): {
    harness: ReturnType<typeof createPluginHarness>;
    plugin: Plugin;
  } {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-vault",
      logContext: "obsidian-vault-test",
    });
    const registry = harness.getEntityRegistry();
    // A real adapter, minimal: the vault under test reads only the body
    // template, but registering a stand-in that cannot be one hides which
    // members it actually depends on.
    const minimalAdapter = (entityType: string): EntityAdapter<BaseEntity> => ({
      entityType,
      schema: baseEntitySchema,
      purpose: `A ${entityType} for the vault tests.`,
      fromMarkdown: () => ({}),
      toMarkdown: (entity: BaseEntity) => entity.content,
      extractMetadata: () => ({}),
      parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
        schema.parse({}),
      generateFrontMatter: () => "",
      getBodyTemplate: () => "",
    });
    registry.registerEntityType(
      "post",
      baseEntitySchema,
      minimalAdapter("post"),
    );
    registry.registerEntityType(
      "note",
      baseEntitySchema,
      minimalAdapter("note"),
    );
    registry.getEffectiveFrontmatterSchema = (
      type: string,
    ): z.ZodObject<z.ZodRawShape> | undefined => schemas.get(type);

    const definition = obsidianVault(deps);
    bindPluginPackageMetadata(definition, {
      name: packageJson.name,
      version: packageJson.version,
    });
    const plugin = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: packageJson.name, version: packageJson.version },
    )[0];
    if (!plugin) throw new Error("Vault plugin was not created");
    return { harness, plugin };
  }

  it("auto-syncs templates during the ready lifecycle", async () => {
    const deps = createMockDeps();
    const { harness, plugin } = installVault(deps);
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    const paths = deps.writeFile.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/tmp/test-vault/_obsidian/templates/post.md");
    expect(paths).toContain("/tmp/test-vault/_obsidian/fileClasses/post.md");
  });

  it("registers no sync tool", async () => {
    const deps = createMockDeps();
    const { harness, plugin } = installVault(deps);
    await harness.installPlugin(plugin);
    const toolNames = harness.getCapabilities().tools.map((tool) => tool.name);
    expect(toolNames.some((name) => name.includes("sync-templates"))).toBe(
      false,
    );
  });
});
