import { describe, it, expect, beforeEach } from "bun:test";
import { ImagePlugin } from "../src";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let harness: PluginTestHarness<ImagePlugin>;
  let plugin: ImagePlugin;

  beforeEach(() => {
    harness = createPluginHarness<ImagePlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new ImagePlugin();
  });

  it("should be instantiable", () => {
    expect(plugin).toBeDefined();
  });

  it("should have correct plugin id", () => {
    expect(plugin.id).toBe("image");
  });

  it("should register as entity plugin", async () => {
    await harness.installPlugin(plugin);
    expect(plugin.type).toBe("entity");
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      await harness.installPlugin(plugin);
      // Plugin registers without error
      expect(plugin.id).toBe("image");
    });

    it("should initialize with custom config", async () => {
      const customPlugin = new ImagePlugin({ defaultAspectRatio: "1:1" });
      await harness.installPlugin(customPlugin);
      expect(customPlugin.id).toBe("image");
    });
  });

  describe("capabilities", () => {
    it("should return zero tools", async () => {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should register image entity type", async () => {
      await harness.installPlugin(plugin);
      expect(harness.getEntityService().getEntityTypes()).toContain("image");
    });
  });
});
