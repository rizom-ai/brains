import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ImagePlugin } from "../src";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let plugin: ImagePlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-datadir" });
    plugin = new ImagePlugin();
  });

  afterEach(() => {
    mock.restore();
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
      await plugin.register(mockShell);

      const config = plugin.getConfig();
      expect(config.defaultStyle).toBe("vivid");
      expect(config.defaultSize).toBe("1792x1024");
    });

    it("should initialize with custom config", async () => {
      const customPlugin = new ImagePlugin({
        defaultStyle: "natural",
        defaultSize: "1024x1024",
      });

      await customPlugin.register(mockShell);

      const config = customPlugin.getConfig();
      expect(config.defaultStyle).toBe("natural");
      expect(config.defaultSize).toBe("1024x1024");
    });
  });

  describe("plugin capabilities", () => {
    it("should register and return capabilities including tools", async () => {
      const capabilities = await plugin.register(mockShell);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(Array.isArray(capabilities.tools)).toBe(true);

      // Check for expected tool names
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("image_upload");
      expect(toolNames).toContain("image_generate");
      expect(toolNames).toContain("image_set-cover");
      expect(toolNames).toHaveLength(3);
    });
  });

  describe("image operations via plugin methods", () => {
    it("should check image generation availability", async () => {
      await plugin.register(mockShell);

      // MockShell defaults to canGenerateImages: false
      expect(plugin.canGenerateImages()).toBe(false);
    });

    it("should get identity data", async () => {
      await plugin.register(mockShell);

      const identity = plugin.getIdentityData();
      expect(identity).toBeDefined();
      expect(identity.name).toBeDefined();
    });

    it("should get profile data", async () => {
      await plugin.register(mockShell);

      const profile = plugin.getProfileData();
      expect(profile).toBeDefined();
    });
  });
});
