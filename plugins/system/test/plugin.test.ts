import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import { createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils";

const getEntityResult = z.object({
  entity: z.object({
    content: z.string(),
    metadata: z.record(z.unknown()),
  }),
});

const listResult = z.object({
  entities: z.array(z.record(z.unknown())),
  count: z.number(),
});

describe("SystemPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: SystemPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Create test harness with dataDir for context
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new SystemPlugin({ searchLimit: 5, debug: false });
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Dashboard Widget Registration", () => {
    it("should register entity-stats widget after system:plugins:ready", async () => {
      // Create a fresh harness and capture messages
      const freshHarness = createPluginHarness({
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

    it("should register widgets with correct renderers", async () => {
      const freshHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir",
      });
      const registeredWidgets: Array<{
        id: string;
        pluginId: string;
        rendererName: string;
      }> = [];

      freshHarness.subscribe("dashboard:register-widget", (message) => {
        const payload = message.payload as {
          id: string;
          pluginId: string;
          rendererName: string;
        };
        registeredWidgets.push({
          id: payload.id,
          pluginId: payload.pluginId,
          rendererName: payload.rendererName,
        });
        return { success: true };
      });

      await freshHarness.installPlugin(new SystemPlugin());

      await freshHarness.sendMessage("system:plugins:ready", {
        timestamp: new Date().toISOString(),
        pluginCount: 1,
      });

      expect(registeredWidgets).toContainEqual({
        id: "character",
        pluginId: "system",
        rendererName: "IdentityWidget",
      });
      expect(registeredWidgets).toContainEqual({
        id: "profile",
        pluginId: "system",
        rendererName: "ProfileWidget",
      });
      expect(registeredWidgets).toContainEqual({
        id: "system-info",
        pluginId: "system",
        rendererName: "SystemWidget",
      });
      freshHarness.reset();
    });

    it("should register character, profile, and system widgets after system:plugins:ready", async () => {
      const freshHarness = createPluginHarness({
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
        id: "character",
        pluginId: "system",
      });
      expect(registeredWidgets).toContainEqual({
        id: "profile",
        pluginId: "system",
      });
      expect(registeredWidgets).toContainEqual({
        id: "system-info",
        pluginId: "system",
      });
      freshHarness.reset();
    });

    it("should NOT register widgets before system:plugins:ready", async () => {
      // This test verifies the timing fix - widgets should only be sent
      // after system:plugins:ready, ensuring Dashboard has subscribed first
      const freshHarness = createPluginHarness({
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
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide all expected tools", () => {
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBe(15);

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
      expect(toolNames).toContain("system_extract");
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
      const schema = z.object(searchTool.inputSchema);
      // entityType is optional — parsing without it should succeed
      expect(() => schema.parse({ query: "test" })).not.toThrow();
      // entityType is accepted when provided
      expect(() =>
        schema.parse({ query: "test", entityType: "note" }),
      ).not.toThrow();
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
      const schema = z.object(listTool.inputSchema);
      // entityType is required — parsing without it should fail
      expect(() => schema.parse({})).toThrow();
      // status is optional — parsing without it should succeed
      expect(() => schema.parse({ entityType: "note" })).not.toThrow();
      // status is accepted when provided
      expect(() =>
        schema.parse({ entityType: "note", status: "published" }),
      ).not.toThrow();
    });
  });

  describe("Tool Execution", () => {
    it("system_search should return search results", async () => {
      const result = await harness.executeTool("system_search", {
        query: "test query",
        limit: 5,
      });

      expectSuccess(result);
      expect(result.data).toHaveProperty("results");
    });

    it("system_get should handle unknown entity type", async () => {
      const result = await harness.executeTool("system_get", {
        entityType: "nonexistent-type",
        id: "some-id",
      });

      expectError(result);
      expect(result.error).toContain("Unknown entity type");
    });

    it("system_list should handle unknown entity type", async () => {
      const result = await harness.executeTool("system_list", {
        entityType: "nonexistent-type",
      });

      expectError(result);
      expect(result.error).toContain("Unknown entity type");
    });

    it("system_get-identity should return identity data", async () => {
      const result = await harness.executeTool("system_get-identity", {});

      expectSuccess(result);
      expect(result.data).toBeDefined();
    });

    it("system_get-profile should return profile data", async () => {
      const result = await harness.executeTool("system_get-profile", {});

      expectSuccess(result);
      expect(result.data).toBeDefined();
    });

    it("system_get-status should return app info", async () => {
      const result = await harness.executeTool("system_get-status", {});

      expectSuccess(result);
      expect(result.data).toBeDefined();
    });

    it("system_check-job-status should return job summary", async () => {
      const result = await harness.executeTool("system_check-job-status", {});

      expectSuccess(result);
      expect(result.data).toHaveProperty("summary");
    });

    it("system_get-conversation should handle missing conversation", async () => {
      const result = await harness.executeTool("system_get-conversation", {
        conversationId: "nonexistent-id",
      });

      expectError(result);
      expect(result.error).toContain("not found");
    });

    it("system_list-conversations should return conversations list", async () => {
      const result = await harness.executeTool("system_list-conversations", {
        limit: 10,
      });

      expectSuccess(result);
      expect(result.data).toHaveProperty("conversations");
    });
  });

  describe("Binary content sanitization", () => {
    const FAKE_BASE64 = "iVBORw0KGgo" + "A".repeat(1000);
    const IMAGE_DATA_URL = `data:image/png;base64,${FAKE_BASE64}`;

    const mockImageEntity = createTestEntity<BaseEntity>("image", {
      id: "test-image",
      content: IMAGE_DATA_URL,
      metadata: {
        title: "Test Image",
        alt: "Test Image",
        format: "png",
        width: 100,
        height: 100,
      },
    });

    const mockPostEntity = createTestEntity<BaseEntity>("post", {
      id: "test-post",
      content: "---\ntitle: Test Post\n---\nHello world",
      metadata: { title: "Test Post", slug: "test-post", status: "published" },
    });

    it("system_get should strip base64 content from image entities", async () => {
      await harness.getEntityService().upsertEntity(mockImageEntity);

      const result = await harness.executeTool("system_get", {
        entityType: "image",
        id: "test-image",
      });

      expectSuccess(result);
      const data = getEntityResult.parse(result.data);
      expect(data.entity.content).not.toContain("base64");
      expect(data.entity.content).not.toContain(FAKE_BASE64);
      expect(data.entity.metadata).toHaveProperty("title", "Test Image");
    });

    it("system_get should preserve content for non-image entities", async () => {
      await harness.getEntityService().upsertEntity(mockPostEntity);

      const result = await harness.executeTool("system_get", {
        entityType: "post",
        id: "test-post",
      });

      expectSuccess(result);
      const data = getEntityResult.parse(result.data);
      expect(data.entity.content).toBe(
        "---\ntitle: Test Post\n---\nHello world",
      );
    });
  });

  describe("system_list returns metadata only", () => {
    const mockPostA = createTestEntity<BaseEntity>("post", {
      id: "post-a",
      content: "---\ntitle: Post A\n---\nLong content here...",
      metadata: { title: "Post A", slug: "post-a", status: "published" },
    });

    const mockPostB = createTestEntity<BaseEntity>("post", {
      id: "post-b",
      content: "---\ntitle: Post B\n---\nMore long content...",
      metadata: { title: "Post B", slug: "post-b", status: "draft" },
    });

    it("should not include content field in list results", async () => {
      await harness.getEntityService().upsertEntity(mockPostA);

      const result = await harness.executeTool("system_list", {
        entityType: "post",
      });

      expectSuccess(result);
      const data = listResult.parse(result.data);
      expect(data.entities).toHaveLength(1);
      expect(data.entities[0]).not.toHaveProperty("content");
    });

    it("should not include contentHash field in list results", async () => {
      await harness.getEntityService().upsertEntity(mockPostA);

      const result = await harness.executeTool("system_list", {
        entityType: "post",
      });

      expectSuccess(result);
      const data = listResult.parse(result.data);
      expect(data.entities[0]).not.toHaveProperty("contentHash");
    });

    it("should include metadata in list results", async () => {
      await harness.getEntityService().upsertEntity(mockPostA);

      const result = await harness.executeTool("system_list", {
        entityType: "post",
      });

      expectSuccess(result);
      const data = listResult.parse(result.data);
      expect(data.entities[0]).toHaveProperty("id", "post-a");
      expect(data.entities[0]).toHaveProperty("entityType", "post");
      expect(data.entities[0]).toHaveProperty("metadata");
      const metadata = z
        .record(z.unknown())
        .parse(data.entities[0]?.["metadata"]);
      expect(metadata).toHaveProperty("title", "Post A");
      expect(metadata).toHaveProperty("status", "published");
    });

    it("should include dates in list results", async () => {
      await harness.getEntityService().upsertEntity(mockPostA);

      const result = await harness.executeTool("system_list", {
        entityType: "post",
      });

      expectSuccess(result);
      const data = listResult.parse(result.data);
      expect(data.entities[0]).toHaveProperty("created");
      expect(data.entities[0]).toHaveProperty("updated");
    });

    it("should return correct count", async () => {
      await harness.getEntityService().upsertEntity(mockPostA);
      await harness.getEntityService().upsertEntity(mockPostB);

      const result = await harness.executeTool("system_list", {
        entityType: "post",
      });

      expectSuccess(result);
      const data = listResult.parse(result.data);
      expect(data.count).toBe(2);
      expect(data.entities).toHaveLength(2);
    });
  });
});
