import { describe, expect, it } from "bun:test";
import { createImageTools } from "../src/tools/image-tools";
import type { ISystemPlugin } from "../src/types";
import type { Image } from "@brains/image";
import type { ToolContext } from "@brains/plugins";

const mockToolContext: ToolContext = {
  interfaceType: "test",
  userId: "test-user",
};

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const mockImageEntity: Image = {
  id: "hero-image",
  entityType: "image",
  content: TINY_PNG_DATA_URL,
  metadata: {
    title: "Hero Image",
    alt: "Hero Image",
    format: "png",
    width: 1,
    height: 1,
  },
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  contentHash: "abc123",
};

function createMockSystemPlugin(
  overrides: {
    getEntity?: unknown;
    listEntities?: unknown[];
    createEntity?: { entityId: string; jobId: string };
  } = {},
): ISystemPlugin {
  return {
    getEntityTypes: () => ["image"],
    getEntityCounts: async () => [{ entityType: "image", count: 1 }],
    searchEntities: async () => [],
    query: async () => ({ response: "", sources: [] }),
    getEntity: async () => overrides.getEntity ?? null,
    findEntity: async () => overrides.getEntity ?? null,
    listEntities: async () => (overrides.listEntities ?? []) as never[],
    getJobStatus: async () => ({}),
    getConversation: async () => null,
    getMessages: async () => [],
    searchConversations: async () => [],
    getIdentityData: () => ({
      name: "test",
      role: "test",
      purpose: "test",
      values: [],
    }),
    getProfileData: () => ({ name: "test" }),
    getAppInfo: async () => ({
      model: "test",
      version: "1.0",
      plugins: [],
      interfaces: [],
      tools: [],
    }),
    createEntity: async () =>
      overrides.createEntity ?? { entityId: "test-id", jobId: "job-1" },
  };
}

describe("Image Tools", () => {
  describe("system_image-upload tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockSystemPlugin();
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-upload");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Upload");
    });

    it("should create image entity with title and source", async () => {
      const plugin = createMockSystemPlugin({
        createEntity: { entityId: "test-image", jobId: "job-123" },
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-upload");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: TINY_PNG_DATA_URL,
        },
        mockToolContext,
      );

      expect(result.status).toBe("success");
      expect(result.data).toBeDefined();
    });

    it("should fail for invalid source", async () => {
      const plugin = createMockSystemPlugin();
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-upload");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: "not-a-valid-source",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
    });
  });

  describe("system_image-get tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockSystemPlugin({
        getEntity: mockImageEntity,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-get");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Retrieve");
    });

    it("should return image entity by ID", async () => {
      const plugin = createMockSystemPlugin({
        getEntity: mockImageEntity,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-get");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler({ id: "hero-image" }, mockToolContext);

      expect(result.status).toBe("success");
      expect(result.data?.id).toBe("hero-image");
    });

    it("should return error for non-existent image", async () => {
      const plugin = createMockSystemPlugin({
        getEntity: null,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-get");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        { id: "non-existent" },
        mockToolContext,
      );

      expect(result.status).toBe("error");
    });
  });

  describe("system_image-list tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockSystemPlugin();
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-list");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("List");
    });

    it("should return list of images", async () => {
      const plugin = createMockSystemPlugin({
        listEntities: [mockImageEntity],
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-list");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler({}, mockToolContext);

      expect(result.status).toBe("success");
      expect(result.data?.images).toHaveLength(1);
    });

    it("should accept optional limit parameter", async () => {
      const plugin = createMockSystemPlugin({
        listEntities: [mockImageEntity],
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_image-list");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler({ limit: 10 }, mockToolContext);

      expect(result.status).toBe("success");
    });
  });
});
