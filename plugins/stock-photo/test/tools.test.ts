import { describe, it, expect, beforeEach } from "bun:test";
import {
  createMockEntityService as createSharedEntityService,
  createTestEntity,
} from "@brains/test-utils";
import { createStockPhotoTools } from "../src/tools";
import type { StockPhotoProvider, SearchResult } from "../src/lib/types";
import type {
  Tool,
  IEntityService,
  BaseEntity,
  EntityMutationResult,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";

const mockContext: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
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

/**
 * Thin wrapper over the shared factory: the base is a complete, type-checked
 * IEntityService, and a test supplies only the behaviour it cares about.
 *
 * The overrides are declared as the concrete shapes a test writes rather than
 * `Partial<IEntityService>`. Those members are generic, and a handler returning
 * a specific entity type can never satisfy `<T extends BaseEntity>` for an
 * arbitrary T, so the generic form would be unusable here.
 */
interface EntityServiceOverrides {
  listEntities?: () => Promise<BaseEntity[]>;
  getEntity?: (request: {
    entityType: string;
    id: string;
  }) => Promise<BaseEntity | null>;
  createEntity?: () => Promise<EntityMutationResult>;
  updateEntity?: (request: {
    entity: { id: string };
  }) => Promise<EntityMutationResult>;
}

function createMockEntityService(
  overrides: EntityServiceOverrides = {},
): IEntityService {
  const base = createSharedEntityService({
    ...(overrides.listEntities
      ? { listEntitiesImpl: overrides.listEntities }
      : {}),
    ...(overrides.getEntity ? { getEntityImpl: overrides.getEntity } : {}),
  });

  return {
    ...base,
    ...(overrides.createEntity
      ? {
          createEntity:
            overrides.createEntity as IEntityService["createEntity"],
        }
      : {}),
    ...(overrides.updateEntity
      ? {
          updateEntity:
            overrides.updateEntity as IEntityService["updateEntity"],
        }
      : {}),
  };
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
  let enqueuedJobs: Array<{ type: string; data: unknown }>;
  let jobs: ServicePluginContext["jobs"];

  beforeEach(() => {
    provider = createMockProvider();
    entityService = createMockEntityService();
    enqueuedJobs = [];
    jobs = {
      enqueue: async (request): Promise<string> => {
        enqueuedJobs.push(request);
        return "queued-stock-photo-job";
      },
    } as ServicePluginContext["jobs"];
    tools = createStockPhotoTools("stock-photo", {
      provider,
      entityService,
      fetchImage: mockFetchImage(),
      jobs,
    });
  });

  it("should create two tools", () => {
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      "stock-photo_search",
      "stock-photo_select",
    ]);
  });

  it("declares tool visibility and side effects", () => {
    const search = findTool(tools, "stock-photo_search");
    const select = findTool(tools, "stock-photo_select");

    expect(search.visibility).toBe("admin");
    expect(search.sideEffects).toBe("none");
    expect(select.visibility).toBe("admin");
    expect(select.sideEffects).toBe("external");
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
        jobs,
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
        jobs,
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
        jobs,
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

    it("should queue image materialization and return result", async () => {
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
        jobId: "queued-stock-photo-job",
        status: "generating",
      });
      expect(enqueuedJobs[0]).toMatchObject({
        type: "select-photo",
        data: validInput,
      });
    });

    it("should leave download tracking to the queued job", async () => {
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
        jobs,
      });

      const tool = findTool(tools, "stock-photo_select");
      await tool.handler(validInput, mockContext);

      expect(downloadTriggered).toBe(false);
      expect(enqueuedJobs).toHaveLength(1);
    });

    it("should reuse existing image entity by sourceUrl", async () => {
      entityService = createMockEntityService({
        listEntities: async () => [
          createTestEntity<BaseEntity>("image", {
            id: "existing-id",
            content: TINY_PNG_DATA_URL,
            metadata: { sourceUrl: validInput.imageUrl },
          }),
        ],
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
        jobs,
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(validInput, mockContext);

      expect(result).toMatchObject({ success: true });
      expect((result as { data: unknown }).data).toMatchObject({
        imageEntityId: "existing-id",
        alreadyExisted: true,
      });
    });

    it("should report cover as pending when queuing with a target entity", async () => {
      let updatedEntity: unknown;

      entityService = createMockEntityService({
        createEntity: async () => ({
          entityId: "abc123",
          jobId: "job-1",
          skipped: false,
        }),
        getEntity: async (request: { entityType: string; id: string }) => {
          if (request.id === "my-post") {
            return createTestEntity<BaseEntity>("post", {
              id: "my-post",
              content: "test",
              metadata: { title: "My Post", status: "draft" },
            });
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
        jobs,
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
        coverSet: false,
        jobId: "queued-stock-photo-job",
        status: "generating",
      });
      expect(enqueuedJobs[0]?.data).toMatchObject({
        targetEntityType: "post",
        targetEntityId: "my-post",
      });
      expect(updatedEntity).toBeUndefined();
    });

    it("should set cover image immediately when the photo already exists", async () => {
      let updatedEntity: { metadata?: Record<string, unknown> } | undefined;

      entityService = createMockEntityService({
        listEntities: async () => [
          createTestEntity<BaseEntity>("image", {
            id: "existing-id",
            content: TINY_PNG_DATA_URL,
            metadata: { sourceUrl: validInput.imageUrl },
          }),
        ],
        getEntity: async (request: { entityType: string; id: string }) => {
          if (request.id === "my-post") {
            return createTestEntity<BaseEntity>("post", {
              id: "my-post",
              content: "test",
              metadata: { title: "My Post" },
            });
          }
          return null;
        },
        updateEntity: async (request: {
          entity: { id: string; metadata?: Record<string, unknown> };
        }) => {
          updatedEntity = request.entity;
          return {
            entityId: request.entity.id,
            jobId: "job-2",
            skipped: false,
          };
        },
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
        jobs,
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
        imageEntityId: "existing-id",
        alreadyExisted: true,
        coverSet: true,
      });
      expect(updatedEntity?.metadata).toMatchObject({
        coverImageId: "existing-id",
      });
    });

    it("should report cover as not set when the photo exists but the target is missing", async () => {
      entityService = createMockEntityService({
        listEntities: async () => [
          createTestEntity<BaseEntity>("image", {
            id: "existing-id",
            content: TINY_PNG_DATA_URL,
            metadata: { sourceUrl: validInput.imageUrl },
          }),
        ],
      });

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: mockFetchImage(),
        jobs,
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(
        {
          ...validInput,
          targetEntityType: "post",
          targetEntityId: "missing",
        },
        mockContext,
      );

      expect(result).toMatchObject({ success: true });
      expect((result as { data: Record<string, unknown> }).data).toMatchObject({
        imageEntityId: "existing-id",
        alreadyExisted: true,
        coverSet: false,
      });
    });

    it("should not download the image inline", async () => {
      const failingFetchImage = async (): Promise<never> => {
        throw new Error("Connection refused");
      };

      tools = createStockPhotoTools("stock-photo", {
        provider,
        entityService,
        fetchImage: failingFetchImage,
        jobs,
      });

      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler(validInput, mockContext);

      expect(result).toMatchObject({ success: true });
      expect(enqueuedJobs).toHaveLength(1);
    });

    it("should reject invalid input", async () => {
      const tool = findTool(tools, "stock-photo_select");
      const result = await tool.handler({ photoId: "abc" }, mockContext);

      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toContain("Invalid input");
    });

    it("should allow the job to derive the default title", async () => {
      const { title: _, alt: __, ...inputWithoutTitleAlt } = validInput;
      const tool = findTool(tools, "stock-photo_select");
      await tool.handler(inputWithoutTitleAlt, mockContext);

      expect(enqueuedJobs[0]?.data).toEqual(inputWithoutTitleAlt);
    });
  });
});
