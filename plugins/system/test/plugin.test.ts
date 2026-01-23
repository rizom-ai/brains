import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import { createCorePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("SystemPlugin", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let plugin: SystemPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Create test harness with dataDir for context
    harness = createCorePluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new SystemPlugin({ searchLimit: 5, debug: false });
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Dashboard Widget Registration", () => {
    it("should register entity-stats widget after system:plugins:ready", async () => {
      // Create a fresh harness and capture messages
      const freshHarness = createCorePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      freshHarness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await freshHarness.installPlugin(new SystemPlugin());

      // Widgets should NOT be registered yet (before system:plugins:ready)
      expect(registeredWidgets).toHaveLength(0);

      // Emit system:plugins:ready - this triggers widget registration
      await freshHarness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(registeredWidgets).toContainEqual({
        id: "entity-stats",
        pluginId: "system",
      });
      freshHarness.reset();
    });

    it("should register job-status widget after system:plugins:ready", async () => {
      const freshHarness = createCorePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      freshHarness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await freshHarness.installPlugin(new SystemPlugin());

      // Emit system:plugins:ready - this triggers widget registration
      await freshHarness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(registeredWidgets).toContainEqual({
        id: "job-status",
        pluginId: "system",
      });
      freshHarness.reset();
    });

    it("should register identity widget after system:plugins:ready", async () => {
      const freshHarness = createCorePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      freshHarness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await freshHarness.installPlugin(new SystemPlugin());

      // Emit system:plugins:ready - this triggers widget registration
      await freshHarness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(registeredWidgets).toContainEqual({
        id: "identity",
        pluginId: "system",
      });
      freshHarness.reset();
    });

    it("should NOT register widgets before system:plugins:ready", async () => {
      // This test verifies the timing fix - widgets should only be sent
      // after system:plugins:ready, ensuring Dashboard has subscribed first
      const freshHarness = createCorePluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{ id: string; pluginId: string }> = [];

      freshHarness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as { id: string; pluginId: string };
        registeredWidgets.push({ id: payload.id, pluginId: payload.pluginId });
        return { success: true };
      });

      await freshHarness.installPlugin(new SystemPlugin());

      // Widgets should NOT be registered yet
      expect(registeredWidgets).toHaveLength(0);
      freshHarness.reset();
    });
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
      // Note: Image tools moved to @brains/image-plugin
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

  describe("Tool Execution", () => {
    it("system_search should return search results", async () => {
      const result = await harness.executeTool("system_search", {
        query: "test query",
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("results");
    });

    it("system_get should handle unknown entity type", async () => {
      const result = await harness.executeTool("system_get", {
        entityType: "nonexistent-type",
        id: "some-id",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown entity type");
    });

    it("system_list should handle unknown entity type", async () => {
      const result = await harness.executeTool("system_list", {
        entityType: "nonexistent-type",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown entity type");
    });

    it("system_get-identity should return identity data", async () => {
      const result = await harness.executeTool("system_get-identity", {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("system_get-profile should return profile data", async () => {
      const result = await harness.executeTool("system_get-profile", {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("system_get-status should return app info", async () => {
      const result = await harness.executeTool("system_get-status", {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("system_check-job-status should return job summary", async () => {
      const result = await harness.executeTool("system_check-job-status", {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("summary");
    });

    it("system_get-conversation should handle missing conversation", async () => {
      const result = await harness.executeTool("system_get-conversation", {
        conversationId: "nonexistent-id",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("system_list-conversations should return conversations list", async () => {
      const result = await harness.executeTool("system_list-conversations", {
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("conversations");
    });
  });
});
