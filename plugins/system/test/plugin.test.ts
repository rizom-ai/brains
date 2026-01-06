import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("SystemPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: SystemPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Create test harness with dataDir for context
    harness = createServicePluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new SystemPlugin({ searchLimit: 5, debug: false });
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("system");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide all expected tools", () => {
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBe(13);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("system_search");
      expect(toolNames).toContain("system_list");
      expect(toolNames).toContain("system_get");
      expect(toolNames).toContain("system_check-job-status");
      expect(toolNames).toContain("system_get-conversation");
      expect(toolNames).toContain("system_list-conversations");
      expect(toolNames).toContain("system_get-identity");
      expect(toolNames).toContain("system_get-profile");
      expect(toolNames).toContain("system_get-messages");
      expect(toolNames).toContain("system_get-status");
      // Image tools
      expect(toolNames).toContain("system_image-upload");
      expect(toolNames).toContain("system_image-get");
      expect(toolNames).toContain("system_image-list");
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

  describe("Tool Schemas", () => {
    it("system_search should have optional entityType", () => {
      const searchTool = capabilities.tools.find(
        (t) => t.name === "system_search",
      );
      expect(searchTool).toBeDefined();
      if (!searchTool) throw new Error("searchTool not found");
      expect(searchTool.inputSchema.entityType).toBeDefined();
      // Verify entityType is optional by checking the zod schema
      const schema = searchTool.inputSchema.entityType;
      expect(schema._def.typeName).toBe("ZodOptional");
    });

    it("system_get should support ID/slug/title lookup", () => {
      const getTool = capabilities.tools.find((t) => t.name === "system_get");
      expect(getTool).toBeDefined();
      if (!getTool) throw new Error("getTool not found");
      expect(getTool.description).toContain("slug");
      expect(getTool.description).toContain("title");
    });

    it("system_list should have entityType and optional status filter", () => {
      const listTool = capabilities.tools.find((t) => t.name === "system_list");
      expect(listTool).toBeDefined();
      if (!listTool) throw new Error("listTool not found");
      expect(listTool.inputSchema.entityType).toBeDefined();
      expect(listTool.inputSchema.status).toBeDefined();
      // Verify status is optional
      const statusSchema = listTool.inputSchema.status;
      expect(statusSchema._def.typeName).toBe("ZodOptional");
    });
  });
});
