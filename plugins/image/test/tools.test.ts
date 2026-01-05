import { describe, expect, it } from "bun:test";
import { createUploadTool, createGetTool, createListTool } from "../src/tools";
import {
  createMockEntityService,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { Image } from "../src/schemas/image";
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

describe("Image Tools", () => {
  describe("image_upload tool", () => {
    it("should have correct metadata", () => {
      const context = createMockServicePluginContext();
      const tool = createUploadTool(context, "image");

      expect(tool.name).toBe("image_upload");
      expect(tool.description).toContain("Upload");
    });

    it("should create image entity with title and source", async () => {
      const context = createMockServicePluginContext();
      const tool = createUploadTool(context, "image");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: TINY_PNG_DATA_URL,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should fail for invalid source", async () => {
      const context = createMockServicePluginContext();
      const tool = createUploadTool(context, "image");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: "not-a-valid-source",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
    });
  });

  describe("image_get tool", () => {
    it("should have correct metadata", () => {
      const entityService = createMockEntityService({
        entityTypes: ["image"],
        returns: { getEntity: mockImageEntity },
      });
      const context = createMockServicePluginContext({ entityService });
      const tool = createGetTool(context, "image");

      expect(tool.name).toBe("image_get");
      expect(tool.description).toContain("Retrieve");
    });

    it("should return image entity by ID", async () => {
      const entityService = createMockEntityService({
        entityTypes: ["image"],
        returns: { getEntity: mockImageEntity },
      });
      const context = createMockServicePluginContext({ entityService });
      const tool = createGetTool(context, "image");

      const result = await tool.handler({ id: "hero-image" }, mockToolContext);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe("hero-image");
    });

    it("should return error for non-existent image", async () => {
      const entityService = createMockEntityService({
        entityTypes: ["image"],
        returns: { getEntity: null },
      });
      const context = createMockServicePluginContext({ entityService });
      const tool = createGetTool(context, "image");

      const result = await tool.handler(
        { id: "non-existent" },
        mockToolContext,
      );

      expect(result.success).toBe(false);
    });
  });

  describe("image_list tool", () => {
    it("should have correct metadata", () => {
      const context = createMockServicePluginContext();
      const tool = createListTool(context, "image");

      expect(tool.name).toBe("image_list");
      expect(tool.description).toContain("List");
    });

    it("should return list of images", async () => {
      const entityService = createMockEntityService({
        entityTypes: ["image"],
        returns: { listEntities: [mockImageEntity] },
      });
      const context = createMockServicePluginContext({ entityService });
      const tool = createListTool(context, "image");

      const result = await tool.handler({}, mockToolContext);

      expect(result.success).toBe(true);
      expect(result.data?.images).toHaveLength(1);
    });

    it("should accept optional limit parameter", async () => {
      const entityService = createMockEntityService({
        entityTypes: ["image"],
        returns: { listEntities: [mockImageEntity] },
      });
      const context = createMockServicePluginContext({ entityService });
      const tool = createListTool(context, "image");

      const result = await tool.handler({ limit: 10 }, mockToolContext);

      expect(result.success).toBe(true);
    });
  });
});
