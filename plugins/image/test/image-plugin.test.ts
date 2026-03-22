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

  it("should have plugin metadata", () => {
    expect(plugin.version).toBeDefined();
    expect(plugin.id).toBe("image");
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      await harness.installPlugin(plugin);

      const config = plugin.getConfig();
      expect(config.defaultAspectRatio).toBe("16:9");
    });

    it("should initialize with custom config", async () => {
      const customPlugin = new ImagePlugin({ defaultAspectRatio: "1:1" });
      await harness.installPlugin(customPlugin);

      const config = customPlugin.getConfig();
      expect(config.defaultAspectRatio).toBe("1:1");
    });
  });

  describe("plugin capabilities", () => {
    it("should register and return capabilities including tools", async () => {
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(Array.isArray(capabilities.tools)).toBe(true);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("image_upload");
      expect(toolNames).toContain("image_generate");
      expect(toolNames).toContain("image_set-cover");
      expect(toolNames).toHaveLength(3);
    });
  });

  describe("image operations via plugin methods", () => {
    it("should check image generation availability", async () => {
      await harness.installPlugin(plugin);

      expect(plugin.canGenerateImages()).toBe(false);
    });

    it("should get identity data", async () => {
      await harness.installPlugin(plugin);

      const identity = plugin.getIdentityData();
      expect(identity).toBeDefined();
      expect(identity.name).toBeDefined();
    });

    it("should get profile data", async () => {
      await harness.installPlugin(plugin);

      const profile = plugin.getProfileData();
      expect(profile).toBeDefined();
    });
  });
});
