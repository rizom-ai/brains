import { describe, it, expect } from "bun:test";
import { parseEvalYaml, loadPluginEvalConfig } from "../src/eval-yaml-loader";

describe("parseEvalYaml", () => {
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
    const result = parseEvalYaml(`brain: "@brains/rover"`);
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

  it("resolves the actual plugin export when a package also exports adapters", async () => {
    const config = await loadPluginEvalConfig({
      plugin: "@brains/link",
    });

    const plugin = config.plugins?.[0];
    expect(plugin).toBeDefined();
    expect(plugin?.id).toBe("link");
    expect(plugin?.packageName).toBe("@brains/link");
    expect(plugin?.type).toBe("entity");
  });
});
