import { describe, expect, it } from "bun:test";
import { createImageTools } from "../src/tools";
import type { IImagePlugin } from "../src/types";
import type { Image } from "@brains/image";
import type { ToolContext, BaseEntity, EntityAdapter } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/test-utils";
import { z } from "@brains/utils";

// Shared schema for parsing tool result data in tests
const withImageId = z.object({ imageId: z.string() });
const withJobId = z.object({ jobId: z.string() });
const setCoverData = z.object({
  imageId: z.string().nullable(),
  generated: z.boolean(),
});
const setCoverDataAsync = z.object({
  jobId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
});

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

const mockPostEntity: BaseEntity = {
  id: "test-post",
  entityType: "post",
  content: "---\ntitle: Test Post\n---\n\nContent here",
  metadata: { title: "Test Post" },
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  contentHash: "def456",
};

function createMockImagePlugin(
  overrides: {
    getEntity?: BaseEntity | null;
    findEntity?: BaseEntity | null;
    createEntity?: { entityId: string; jobId: string };
    updateEntity?: { entityId: string; jobId: string };
    getAdapter?: EntityAdapter<BaseEntity> | undefined;
    canGenerateImages?: boolean;
  } = {},
): IImagePlugin {
  return {
    getEntity: async () => overrides.getEntity ?? null,
    findEntity: async () => overrides.findEntity ?? overrides.getEntity ?? null,
    createEntity: async () =>
      overrides.createEntity ?? { entityId: "test-id", jobId: "job-1" },
    updateEntity: async () =>
      overrides.updateEntity ?? { entityId: "test-id", jobId: "job-2" },
    getAdapter: <T extends BaseEntity>() =>
      overrides.getAdapter as EntityAdapter<T> | undefined,
    canGenerateImages: () => overrides.canGenerateImages ?? false,
    getIdentityData: () => ({
      name: "test",
      role: "test",
      purpose: "test",
      values: [],
    }),
    getProfileData: () => ({ name: "test" }),
  };
}

describe("Image Tools", () => {
  describe("image_upload tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockImagePlugin();
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Upload");
    });

    it("should upload image from data URL", async () => {
      const plugin = createMockImagePlugin({
        createEntity: { entityId: "test-image", jobId: "job-123" },
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: TINY_PNG_DATA_URL,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = withImageId.parse(result.data);
        expect(data.imageId).toBe("test-image");
      }
    });

    it("should reject invalid source", async () => {
      const plugin = createMockImagePlugin();
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: "invalid-source",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid source");
      }
    });
  });

  describe("image_generate tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockImagePlugin();
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Queue");
      expect(tool?.description).toContain("DALL-E");
    });

    it("should queue job when API is available", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
      });
      const context = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "gen-job-123",
        },
      });
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          prompt: "A beautiful sunset",
          title: "Sunset Image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = withJobId.parse(result.data);
        expect(data.jobId).toBe("gen-job-123");
      }

      // Verify job was enqueued with correct data
      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "image-generate",
        expect.objectContaining({
          prompt: expect.stringContaining("A beautiful sunset"),
          title: "Sunset Image",
        }),
        mockToolContext,
        expect.any(Object),
      );
    });

    it("should fail when image generation not available", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: false,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          prompt: "A beautiful sunset",
          title: "Sunset Image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not available");
      }
    });

    it("should pass size and style options to job", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
      });
      const context = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "gen-job-456",
        },
      });
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");
      if (!tool) throw new Error("Tool not found");

      await tool.handler(
        {
          prompt: "A test image",
          title: "Test",
          size: "1024x1024",
          style: "natural",
        },
        mockToolContext,
      );

      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "image-generate",
        expect.objectContaining({
          size: "1024x1024",
          style: "natural",
        }),
        mockToolContext,
        expect.any(Object),
      );
    });
  });

  describe("image_set-cover tool", () => {
    const mockAdapterWithCover = {
      supportsCoverImage: true,
    } as EntityAdapter<BaseEntity>;

    const mockAdapterWithoutCover = {
      supportsCoverImage: false,
    } as EntityAdapter<BaseEntity>;

    it("should have correct metadata", () => {
      const plugin = createMockImagePlugin();
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("cover image");
    });

    it("should set existing cover image", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: mockImageEntity,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: "hero-image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = setCoverData.parse(result.data);
        expect(data.imageId).toBe("hero-image");
        expect(data.generated).toBe(false);
      }
    });

    it("should remove cover image with null", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: null,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = setCoverData.parse(result.data);
        expect(data.imageId).toBeNull();
      }
    });

    it("should fail when entity type doesn't support cover images", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithoutCover,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "note",
          entityId: "test-note",
          imageId: "hero-image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("doesn't support cover images");
      }
    });

    it("should fail when entity not found", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: null,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "nonexistent",
          imageId: "hero-image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should fail when image not found", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: null,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: "nonexistent-image",
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Image not found");
      }
    });

    it("should queue job when generate:true", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const context = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "cover-job-789",
        },
      });
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          generate: true,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const data = setCoverDataAsync.parse(result.data);
        expect(data.jobId).toBe("cover-job-789");
        expect(data.entityType).toBe("post");
        expect(data.entityId).toBe("test-post");
      }

      // Verify job was enqueued with target entity info
      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "image-generate",
        expect.objectContaining({
          targetEntityType: "post",
          targetEntityId: "test-post",
        }),
        mockToolContext,
        expect.any(Object),
      );
    });

    it("should fail generation when API not available", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: false,
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const context = createMockServicePluginContext();
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          generate: true,
        },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not available");
      }
    });

    it("should pass size and style options when generating", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const context = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "cover-job-abc",
        },
      });
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          generate: true,
          size: "1024x1024",
          style: "natural",
        },
        mockToolContext,
      );

      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "image-generate",
        expect.objectContaining({
          size: "1024x1024",
          style: "natural",
        }),
        mockToolContext,
        expect.any(Object),
      );
    });

    it("BUG: should use title from series entity metadata when generating cover", async () => {
      // Regression test: Series entities have 'title' in metadata (required by CoverImageMetadata)
      // Previously series only had 'name', causing entity.metadata.title to be undefined
      const mockSeriesEntity: BaseEntity = {
        id: "series-ecosystem",
        entityType: "series",
        content:
          "---\ntitle: Ecosystem Architecture\nslug: ecosystem\n---\n\n# Ecosystem Architecture",
        metadata: {
          title: "Ecosystem Architecture", // Required for CoverImageMetadata interface
          slug: "ecosystem",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "series123",
      };

      const plugin = createMockImagePlugin({
        canGenerateImages: true,
        getAdapter: mockAdapterWithCover,
        findEntity: mockSeriesEntity,
      });
      const context = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "series-cover-job",
        },
      });
      const tools = createImageTools(context, plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "series",
          entityId: "series-ecosystem",
          generate: true,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);

      // Verify job was enqueued with correct title (not "undefined Cover")
      expect(context.jobs.enqueue).toHaveBeenCalledWith(
        "image-generate",
        expect.objectContaining({
          title: "Ecosystem Architecture Cover", // Should use the series title
          targetEntityType: "series",
          targetEntityId: "series-ecosystem",
        }),
        mockToolContext,
        expect.any(Object),
      );
    });
  });
});
