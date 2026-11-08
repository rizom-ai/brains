import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { parseEvalYaml, loadPluginEvalConfig } from "../src/eval-yaml-loader";

const namedExportsModule = join(
  import.meta.dir,
  "fixtures",
  "named-plugin-exports.ts",
);
const defaultExportModule = join(
  import.meta.dir,
  "fixtures",
  "default-plugin-export.ts",
);

describe("parseEvalYaml", () => {
  it("should parse eval.yaml with the export that provides the plugin", () => {
    const result = parseEvalYaml(`
plugin: "@brains/assessment/eval"
export: swotEvalPlugin
`);
    expect(result).toEqual({
      plugin: "@brains/assessment/eval",
      export: "swotEvalPlugin",
    });
  });

  it("should parse minimal eval.yaml with just plugin", () => {
    const result = parseEvalYaml(`plugin: "@brains/blog"`);
    expect(result).toEqual({ plugin: "@brains/blog" });
  });

  it("should parse eval.yaml with plugin config", () => {
    const result = parseEvalYaml(`
plugin: "@brains/blog"
config:
  autoGenerateOnPublish: false
`);
    expect(result).toEqual({
      plugin: "@brains/blog",
      config: { autoGenerateOnPublish: false },
    });
  });

  it("should parse eval.yaml with model override", () => {
    const result = parseEvalYaml(`
plugin: "@brains/blog"
model: gpt-4o-mini
`);
    expect(result).toEqual({
      plugin: "@brains/blog",
      model: "gpt-4o-mini",
    });
  });

  it("should return null for yaml without plugin field", () => {
    const result = parseEvalYaml(`brain: "@acme/brain-definition"`);
    expect(result).toBeNull();
  });

  it("should return null for empty yaml", () => {
    const result = parseEvalYaml("");
    expect(result).toBeNull();
  });

  it("should return null for invalid yaml", () => {
    const result = parseEvalYaml(":::invalid:::");
    expect(result).toBeNull();
  });
});

describe("loadPluginEvalConfig", () => {
  it("propagates model from eval.yaml into app config", async () => {
    const config = await loadPluginEvalConfig({
      plugin: "@brains/topics",
      model: "gpt-4o-mini",
    });

    expect(config.aiModel).toBe("gpt-4o-mini");
  });

  it("falls back to AI_MODEL from env when eval.yaml omits model", async () => {
    const originalModel = process.env["AI_MODEL"];
    process.env["AI_MODEL"] = "gpt-4o-mini";

    try {
      const config = await loadPluginEvalConfig({
        plugin: "@brains/topics",
      });

      expect(config.aiModel).toBe("gpt-4o-mini");
    } finally {
      if (originalModel === undefined) {
        delete process.env["AI_MODEL"];
      } else {
        process.env["AI_MODEL"] = originalModel;
      }
    }
  });

  it("loads the export eval.yaml names, not the export that sorts first", async () => {
    const config = await loadPluginEvalConfig({
      plugin: namedExportsModule,
      export: "declaredPlugin",
    });

    expect(config.plugins?.map((plugin) => plugin.id)).toEqual(["declared"]);
  });

  it("calls the named factory with eval.yaml's config", async () => {
    const config = await loadPluginEvalConfig({
      plugin: namedExportsModule,
      export: "declaredPlugin",
      config: { suffix: "configured" },
    });

    expect(config.plugins?.map((plugin) => plugin.id)).toEqual([
      "declared-configured",
    ]);
  });

  it("constructs a named plugin class", async () => {
    const config = await loadPluginEvalConfig({
      plugin: "@brains/link",
      export: "LinkPlugin",
    });

    const plugin = config.plugins?.[0];
    expect(plugin?.id).toBe("link");
    expect(plugin?.packageName).toBe("@brains/link");
    expect(plugin?.type).toBe("entity");
  });

  it("loads the module's default export when eval.yaml names none", async () => {
    const config = await loadPluginEvalConfig({ plugin: defaultExportModule });

    expect(config.plugins?.map((plugin) => plugin.id)).toEqual(["default"]);
  });

  it("refuses a module without a default export when eval.yaml names none", () => {
    expect(
      loadPluginEvalConfig({ plugin: namedExportsModule }),
    ).rejects.toThrow(`${namedExportsModule} has no export "default"`);
  });

  it("refuses a named export that does not provide a plugin", () => {
    expect(
      loadPluginEvalConfig({ plugin: "@brains/link", export: "LinkAdapter" }),
    ).rejects.toThrow(`@brains/link export "LinkAdapter" is not a plugin`);
  });
});
