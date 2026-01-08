import { describe, expect, it } from "bun:test";
import { createImageTools } from "../src/tools/image-tools";
import type { ISystemPlugin } from "../src/types";
import type { Image } from "@brains/image";
import type { ToolContext, BaseEntity, EntityAdapter } from "@brains/plugins";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";

// Response data types for type-safe assertions
interface ImageGetResponse {
  id: string;
  title: string;
  format: string;
  width: number;
  height: number;
}

interface ImageListResponse {
  images: Array<{ id: string; title: string }>;
  count: number;
}

interface SetCoverResponse {
  entityType: string;
  entityId: string;
  imageId: string | null;
  generated: boolean;
}

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

function createMockSystemPlugin(
  overrides: {
    getEntity?: BaseEntity | null;
    findEntity?: BaseEntity | null;
    listEntities?: BaseEntity[];
    createEntity?: { entityId: string; jobId: string };
    updateEntity?: { entityId: string; jobId: string };
    getAdapter?: EntityAdapter<BaseEntity> | undefined;
    canGenerateImages?: boolean;
    generateImage?: ImageGenerationResult;
  } = {},
): ISystemPlugin {
  return {
    getEntityTypes: () => ["image", "post"],
    getEntityCounts: async () => [{ entityType: "image", count: 1 }],
    searchEntities: async () => [],
    query: async () => ({ message: "", sources: [] }),
    getEntity: async () => overrides.getEntity ?? null,
    findEntity: async () => overrides.findEntity ?? overrides.getEntity ?? null,
    listEntities: async () => overrides.listEntities ?? [],
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
    updateEntity: async () =>
      overrides.updateEntity ?? { entityId: "test-id", jobId: "job-2" },
    getAdapter: <T extends BaseEntity>() =>
      overrides.getAdapter as EntityAdapter<T> | undefined,
    canGenerateImages: () => overrides.canGenerateImages ?? false,
    generateImage: async () =>
      overrides.generateImage ?? {
        dataUrl: TINY_PNG_DATA_URL,
        base64: TINY_PNG_BASE64,
      },
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
      const data = result.data as unknown as ImageGetResponse;

      expect(result.status).toBe("success");
      expect(data.id).toBe("hero-image");
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
      const data = result.data as unknown as ImageListResponse;

      expect(result.status).toBe("success");
      expect(data.images).toHaveLength(1);
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

  describe("system_set-cover tool", () => {
    const mockAdapterWithCover = {
      supportsCoverImage: true,
    } as EntityAdapter<BaseEntity>;

    const mockAdapterWithoutCover = {
      supportsCoverImage: false,
    } as EntityAdapter<BaseEntity>;

    it("should have correct metadata", () => {
      const plugin = createMockSystemPlugin();
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("cover image");
    });

    it("should set existing image as cover", async () => {
      const plugin = createMockSystemPlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: mockImageEntity,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: "hero-image",
        },
        mockToolContext,
      );
      const data = result.data as unknown as SetCoverResponse;

      expect(result.status).toBe("success");
      expect(data.imageId).toBe("hero-image");
    });

    it("should remove cover image with null", async () => {
      const plugin = createMockSystemPlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: null,
        },
        mockToolContext,
      );
      const data = result.data as unknown as SetCoverResponse;

      expect(result.status).toBe("success");
      expect(data.imageId).toBeNull();
    });

    it("should fail for unsupported entity type", async () => {
      const plugin = createMockSystemPlugin({
        getAdapter: mockAdapterWithoutCover,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "unsupported",
          entityId: "test",
          imageId: "hero-image",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("doesn't support cover images");
    });

    it("should fail when entity not found", async () => {
      const plugin = createMockSystemPlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: null,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "non-existent",
          imageId: "hero-image",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("Entity not found");
    });

    it("should fail when image not found", async () => {
      const plugin = createMockSystemPlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: null,
      });
      const tools = createImageTools(plugin, "system");
      const tool = tools.find((t) => t.name === "system_set-cover");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          entityType: "post",
          entityId: "test-post",
          imageId: "non-existent-image",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("Image not found");
    });

    describe("generate flag", () => {
      it("should generate and set cover image when generate:true", async () => {
        const plugin = createMockSystemPlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
          generateImage: {
            dataUrl: TINY_PNG_DATA_URL,
            base64: TINY_PNG_BASE64,
          },
          createEntity: { entityId: "test-post-cover", jobId: "job-1" },
        });
        const tools = createImageTools(plugin, "system");
        const tool = tools.find((t) => t.name === "system_set-cover");
        if (!tool) throw new Error("Tool not found");

        const result = await tool.handler(
          {
            entityType: "post",
            entityId: "test-post",
            generate: true,
          },
          mockToolContext,
        );
        const data = result.data as unknown as SetCoverResponse;

        expect(result.status).toBe("success");
        expect(data.generated).toBe(true);
        expect(data.imageId).toBeDefined();
      });

      it("should use custom prompt when provided", async () => {
        let capturedPrompt = "";
        const plugin = createMockSystemPlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
          generateImage: {
            dataUrl: TINY_PNG_DATA_URL,
            base64: TINY_PNG_BASE64,
          },
        });
        // Override generateImage to capture the prompt
        plugin.generateImage = async (
          prompt: string,
        ): Promise<ImageGenerationResult> => {
          capturedPrompt = prompt;
          return { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 };
        };
        const tools = createImageTools(plugin, "system");
        const tool = tools.find((t) => t.name === "system_set-cover");
        if (!tool) throw new Error("Tool not found");

        await tool.handler(
          {
            entityType: "post",
            entityId: "test-post",
            generate: true,
            prompt: "A custom image prompt",
          },
          mockToolContext,
        );

        expect(capturedPrompt).toContain("A custom image prompt");
      });

      it("should fail when image generation not available", async () => {
        const plugin = createMockSystemPlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: false,
        });
        const tools = createImageTools(plugin, "system");
        const tool = tools.find((t) => t.name === "system_set-cover");
        if (!tool) throw new Error("Tool not found");

        const result = await tool.handler(
          {
            entityType: "post",
            entityId: "test-post",
            generate: true,
          },
          mockToolContext,
        );

        expect(result.status).toBe("error");
        expect(result.message).toContain("Image generation not available");
      });

      it("should accept size and style options for generation", async () => {
        let capturedOptions: ImageGenerationOptions | undefined;
        const plugin = createMockSystemPlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
        });
        plugin.generateImage = async (
          _prompt: string,
          options?: ImageGenerationOptions,
        ): Promise<ImageGenerationResult> => {
          capturedOptions = options;
          return { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 };
        };
        const tools = createImageTools(plugin, "system");
        const tool = tools.find((t) => t.name === "system_set-cover");
        if (!tool) throw new Error("Tool not found");

        await tool.handler(
          {
            entityType: "post",
            entityId: "test-post",
            generate: true,
            size: "1792x1024",
            style: "natural",
          },
          mockToolContext,
        );

        expect(capturedOptions?.size).toBe("1792x1024");
        expect(capturedOptions?.style).toBe("natural");
      });
    });
  });
});
