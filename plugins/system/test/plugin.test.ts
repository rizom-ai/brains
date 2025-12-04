import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createCorePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("SystemPlugin", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let plugin: SystemPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Create test harness
    harness = createCorePluginHarness();

    plugin = new SystemPlugin({ searchLimit: 5, debug: false });
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("system");
      expect(plugin.type).toBe("core");
      expect(plugin.version).toBeDefined();
    });

    it("should provide all expected tools", () => {
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBe(10);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("system_query");
      expect(toolNames).toContain("system_search");
      expect(toolNames).toContain("system_get");
      expect(toolNames).toContain("system_check-job-status");
      expect(toolNames).toContain("system_get-conversation");
      expect(toolNames).toContain("system_list-conversations");
      expect(toolNames).toContain("system_get-identity");
      expect(toolNames).toContain("system_get-profile");
      expect(toolNames).toContain("system_get-messages");
      expect(toolNames).toContain("system_get-status");
    });

    it("should provide all expected commands", () => {
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.commands.length).toBe(8);

      const commandNames = capabilities.commands.map((c) => c.name);
      expect(commandNames).toContain("search");
      expect(commandNames).toContain("get");
      expect(commandNames).toContain("get-job-status");
      expect(commandNames).toContain("get-conversation");
      expect(commandNames).toContain("list-conversations");
      expect(commandNames).toContain("get-messages");
      expect(commandNames).toContain("identity");
      expect(commandNames).toContain("status");
    });
  });

  describe("Configuration", () => {
    it("should use provided configuration", () => {
      const customPlugin = new SystemPlugin({
        searchLimit: 10,
        debug: true,
      });

      expect(customPlugin.id).toBe("system");
    });

    it("should use default configuration", () => {
      const defaultPlugin = new SystemPlugin();

      expect(defaultPlugin.id).toBe("system");
    });
  });
});
