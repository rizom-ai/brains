import { describe, expect, it } from "bun:test";
import { createImageTools } from "../src/tools";
import type { IImagePlugin } from "../src/types";
import type { Image } from "@brains/image";
import type {
  ToolContext,
  BaseEntity,
  EntityAdapter,
  ImageGenerationResult,
  ImageGenerationOptions,
} from "@brains/plugins";

// Response data types for type-safe assertions
interface ImageUploadResponse {
  imageId: string;
  jobId: string;
}

interface ImageGenerateResponse {
  imageId: string;
  jobId: string;
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

function createMockImagePlugin(
  overrides: {
    getEntity?: BaseEntity | null;
    findEntity?: BaseEntity | null;
    createEntity?: { entityId: string; jobId: string };
    updateEntity?: { entityId: string; jobId: string };
    getAdapter?: EntityAdapter<BaseEntity> | undefined;
    canGenerateImages?: boolean;
    generateImage?: { dataUrl: string; base64: string };
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
    generateImage: async () =>
      overrides.generateImage ?? {
        dataUrl: TINY_PNG_DATA_URL,
        base64: TINY_PNG_BASE64,
      },
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
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Upload");
    });

    it("should create image entity with title and data URL source", async () => {
      const plugin = createMockImagePlugin({
        createEntity: { entityId: "test-image", jobId: "job-123" },
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");
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
      const data = result.data as unknown as ImageUploadResponse;
      expect(data.imageId).toBeDefined();
    });

    it("should fail for invalid source", async () => {
      const plugin = createMockImagePlugin();
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_upload");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          title: "Test Image",
          source: "not-a-valid-source",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("Invalid source");
    });
  });

  describe("image_generate tool", () => {
    it("should have correct metadata", () => {
      const plugin = createMockImagePlugin();
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Generate");
      expect(tool?.description).toContain("DALL-E");
    });

    it("should generate image when API is available", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
        generateImage: { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 },
        createEntity: { entityId: "generated-image", jobId: "job-456" },
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          prompt: "A beautiful sunset",
          title: "Sunset Image",
        },
        mockToolContext,
      );
      const data = result.data as unknown as ImageGenerateResponse;

      expect(result.status).toBe("success");
      expect(data.imageId).toBeDefined();
    });

    it("should fail when image generation not available", async () => {
      const plugin = createMockImagePlugin({
        canGenerateImages: false,
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_generate");
      if (!tool) throw new Error("Tool not found");

      const result = await tool.handler(
        {
          prompt: "A beautiful sunset",
          title: "Sunset Image",
        },
        mockToolContext,
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("not available");
    });

    it("should accept size and style options", async () => {
      let capturedPrompt: string | undefined;
      let capturedOptions: ImageGenerationOptions | undefined;
      const plugin = createMockImagePlugin({
        canGenerateImages: true,
      });
      plugin.generateImage = async (
        prompt: string,
        options?: ImageGenerationOptions,
      ): Promise<ImageGenerationResult> => {
        capturedPrompt = prompt;
        capturedOptions = options;
        return { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 };
      };
      const tools = createImageTools(plugin, "image");
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

      expect(capturedPrompt).toContain("A test image");
      expect(capturedOptions?.size).toBe("1024x1024");
      expect(capturedOptions?.style).toBe("natural");
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
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("cover image");
    });

    it("should set existing image as cover", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: mockImageEntity,
      });
      const tools = createImageTools(plugin, "image");
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
      const data = result.data as unknown as SetCoverResponse;

      expect(result.status).toBe("success");
      expect(data.imageId).toBe("hero-image");
      expect(data.generated).toBe(false);
    });

    it("should remove cover image with null", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
      });
      const tools = createImageTools(plugin, "image");
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
      const data = result.data as unknown as SetCoverResponse;

      expect(result.status).toBe("success");
      expect(data.imageId).toBeNull();
    });

    it("should fail for unsupported entity type", async () => {
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithoutCover,
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
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
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: null,
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
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
      const plugin = createMockImagePlugin({
        getAdapter: mockAdapterWithCover,
        findEntity: mockPostEntity,
        getEntity: null,
      });
      const tools = createImageTools(plugin, "image");
      const tool = tools.find((t) => t.name === "image_set-cover");
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
        const plugin = createMockImagePlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
          generateImage: {
            dataUrl: TINY_PNG_DATA_URL,
            base64: TINY_PNG_BASE64,
          },
          createEntity: { entityId: "test-post-cover", jobId: "job-1" },
        });
        const tools = createImageTools(plugin, "image");
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
        const data = result.data as unknown as SetCoverResponse;

        expect(result.status).toBe("success");
        expect(data.generated).toBe(true);
        expect(data.imageId).toBeDefined();
      });

      it("should use custom prompt when provided", async () => {
        let capturedPrompt = "";
        const plugin = createMockImagePlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
          generateImage: {
            dataUrl: TINY_PNG_DATA_URL,
            base64: TINY_PNG_BASE64,
          },
        });
        plugin.generateImage = async (
          prompt: string,
        ): Promise<ImageGenerationResult> => {
          capturedPrompt = prompt;
          return { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 };
        };
        const tools = createImageTools(plugin, "image");
        const tool = tools.find((t) => t.name === "image_set-cover");
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
        const plugin = createMockImagePlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: false,
        });
        const tools = createImageTools(plugin, "image");
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

        expect(result.status).toBe("error");
        expect(result.message).toContain("not available");
      });

      it("should accept size and style options for generation", async () => {
        let capturedPrompt: string | undefined;
        let capturedOptions: ImageGenerationOptions | undefined;
        const plugin = createMockImagePlugin({
          getAdapter: mockAdapterWithCover,
          findEntity: mockPostEntity,
          canGenerateImages: true,
        });
        plugin.generateImage = async (
          prompt: string,
          options?: ImageGenerationOptions,
        ): Promise<ImageGenerationResult> => {
          capturedPrompt = prompt;
          capturedOptions = options;
          return { dataUrl: TINY_PNG_DATA_URL, base64: TINY_PNG_BASE64 };
        };
        const tools = createImageTools(plugin, "image");
        const tool = tools.find((t) => t.name === "image_set-cover");
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

        expect(capturedPrompt).toContain("Test Post");
        expect(capturedOptions?.size).toBe("1792x1024");
        expect(capturedOptions?.style).toBe("natural");
      });
    });
  });
});
