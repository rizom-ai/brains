import { describe, it, expect, beforeEach } from "bun:test";
import { createStockPhotoTools } from "../src/tools";
import type { StockPhotoProvider, SearchResult } from "../src/lib/types";
import type { Tool, IEntityService, ToolContext } from "@brains/plugins";

const mockContext: ToolContext = {
  interfaceType: "test",
  userId: "test-user",
};

// -- Mock provider --

function createMockProvider(
  overrides: Partial<StockPhotoProvider> = {},
): StockPhotoProvider {
  return {
    searchPhotos: async () => ({
      photos: [],
      total: 0,
      totalPages: 0,
      page: 1,
    }),
    triggerDownload: async (): Promise<void> => {},
    ...overrides,
  };
}

// -- Mock entity service --

function createMockEntityService(
  overrides: Record<string, unknown> = {},
): IEntityService {
  return {
    getEntity: async () => null,
    getEntityRaw: async () => null,
    listEntities: async () => [],
    search: async () => [],
    getEntityTypes: () => [],
    hasEntityType: () => false,
    getEntityCount: async () => 0,
    createEntity: async () => ({
      entityId: "test-id",
      jobId: "job-1",
      skipped: false,
    }),
    updateEntity: async () => ({
      entityId: "test-id",
      jobId: "job-2",
      skipped: false,
    }),
    deleteEntity: async () => true,
    upsertEntity: async () => ({
      entityId: "test-id",
      jobId: "job-3",
      skipped: false,
      created: true,
    }),
    ...overrides,
  } as unknown as IEntityService;
}

// -- Minimal PNG data URL for testing --

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function mockFetchImage(): (url: string) => Promise<string> {
  return async () => TINY_PNG_DATA_URL;
}

// -- Helpers --

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe("stock-photo tools", () => {
  let provider: StockPhotoProvider;
  let entityService: IEntityService;
  let tools: Tool[];

  beforeEach(() => {
    provider = createMockProvider();
    entityService = createMockEntityService();
    tools = createStockPhotoTools("stock-photo", {
      provider,
      entityService,
      fetchImage: mockFetchImage(),
    });
  });

  it("should create two tools", () => {
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      "stock-photo_search",
      "stock-photo_select",
    ]);
  });

  describe("stock-photo_search", () => {
    it("should return search results from provider", async () => {
      const searchResult: SearchResult = {
        photos: [
          {
            id: "abc",
            description: "Mountains",
            altDescription: "Snowy peaks",
            thumbnailUrl: "https://thumb.url",
            imageUrl: "https://image.url",
            photographerName: "Jane",
            photographerUrl: "https://unsplash.com/@jane",
            sourceUrl: "https://unsplash.com/photos/abc",
            downloadLocation: "https://api.unsplash.com/photos/abc/download",
            width: 4000,
            height: 3000,
          },
        ],
        total: 50,
        totalPages: 5,
        page: 1,
      };

      provider = createMockProvider({
        searchPhotos: async () => searchResult,
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_search");
      const result = await tool.handler({ query: "mountains" }, mockContext);

      expect(result).toMatchObject({ success: true });
      expect((result as { data: unknown }).data).toEqual(searchResult);
    });

    it("should pass perPage and page to provider", async () => {
      let capturedOptions: { page: number; perPage: number } | undefined;

      provider = createMockProvider({
        searchPhotos: async (_query, options) => {
          capturedOptions = options;
          return { photos: [], total: 0, totalPages: 0, page: options.page };
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_search");
      await tool.handler({ query: "test", perPage: 5, page: 2 }, mockContext);

      expect(capturedOptions).toEqual({ page: 2, perPage: 5 });
    });

    it("should return error on provider failure", async () => {
      provider = createMockProvider({
        searchPhotos: async () => {
          throw new Error("Rate limited");
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_search");
      const result = await tool.handler({ query: "test" }, mockContext);

      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toBe("Rate limited");
    });

    it("should reject invalid input", async () => {
      const tool = findTool(tools, "stock-photo_search");
      const result = await tool.handler({ perPage: 50 }, mockContext);

      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toContain("Invalid input");
    });
  });

  describe("stock-photo_select", () => {
    const validInput = {
      photoId: "abc123",
      downloadLocation: "https://api.unsplash.com/photos/abc123/download",
      photographerName: "Jane Smith",
      photographerUrl: "https://unsplash.com/@janesmith",
      sourceUrl: "https://unsplash.com/photos/abc123",
      imageUrl: "https://images.unsplash.com/photo-abc123?w=1080",
      title: "Mountain sunset",
      alt: "Snow-capped mountains at sunset",
    };

    it("should create image entity and return result", async () => {
      entityService = createMockEntityService({
        createEntity: async () => ({
          entityId: "abc123",
          jobId: "job-1",
          skipped: false,
        }),
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(validInput, mockContext);

      expect(result).toMatchObject({ success: true });
      expect((result as { data: unknown }).data).toEqual({
        imageEntityId: "abc123",
        alreadyExisted: false,
        attribution: {
          photographerName: "Jane Smith",
          photographerUrl: "https://unsplash.com/@janesmith",
          sourceUrl: "https://unsplash.com/photos/abc123",
        },
      });
    });

    it("should trigger download tracking", async () => {
      let downloadTriggered = false;

      provider = createMockProvider({
        triggerDownload: async () => {
          downloadTriggered = true;
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_select");
      await tool.handler(validInput, mockContext);

      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(downloadTriggered).toBe(true);
    });

    it("should reuse existing image entity by sourceUrl", async () => {
      entityService = createMockEntityService({
        listEntities: async () => [
          {
            id: "existing-id",
            entityType: "image",
            content: TINY_PNG_DATA_URL,
            metadata: { sourceUrl: validInput.imageUrl },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(validInput, mockContext);

      expect(result).toMatchObject({ success: true });
      expect((result as { data: unknown }).data).toMatchObject({
        imageEntityId: "existing-id",
        alreadyExisted: true,
      });
    });

    it("should set cover image on target entity", async () => {
      let updatedEntity: unknown;

      entityService = createMockEntityService({
        createEntity: async () => ({
          entityId: "abc123",
          jobId: "job-1",
          skipped: false,
        }),
        getEntity: async (request: { entityType: string; id: string }) => {
          if (request.id === "my-post") {
            return {
              id: "my-post",
              entityType: "post",
              content: "test",
              metadata: { title: "My Post", status: "draft" },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }
          return null;
        },
        updateEntity: async (request: { entity: { id: string } }) => {
          const entity = request.entity;
          updatedEntity = entity;
          return { entityId: entity.id, jobId: "job-2", skipped: false };
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(
        {
          ...validInput,
          targetEntityType: "post",
          targetEntityId: "my-post",
        },
        mockContext,
      );

      expect(result).toMatchObject({ success: true });
      expect((result as { data: Record<string, unknown> }).data).toMatchObject({
        coverSet: true,
      });
      expect(updatedEntity).toMatchObject({
        id: "my-post",
        metadata: { coverImageId: "abc123" },
      });
    });

    it("should return error when image download fails", async () => {
      const failingFetchImage = async (): Promise<never> => {
        throw new Error("Connection refused");
      };

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: failingFetchImage,
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(validInput, mockContext);

      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toBe("Connection refused");
    });

    it("should reject invalid input", async () => {
      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler({ photoId: "abc" }, mockContext);

      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toContain("Invalid input");
    });

    it("should use photoId as default title when title not provided", async () => {
      let createdMetadata: Record<string, unknown> | undefined;

      entityService = createMockEntityService({
        createEntity: async (request: {
          entity: { metadata: Record<string, unknown> };
        }) => {
          createdMetadata = request.entity.metadata;
          return { entityId: "abc123", jobId: "job-1", skipped: false };
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
      });

      const { title: _, alt: __, ...inputWithoutTitleAlt } = validInput;
      const tool = findTool(tools, "stock-photo_select");
      await tool.handler(inputWithoutTitleAlt, mockContext);

      expect(createdMetadata?.["title"]).toBe("Stock photo abc123");
    });
  });
});
