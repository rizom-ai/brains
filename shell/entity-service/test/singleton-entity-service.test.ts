import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { SingletonEntityService } from "../src/singleton-entity-service";
import type { EntityService, BaseEntity } from "../src/types";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";

interface TestBody {
  title: string;
  description: string;
}

class TestSingletonService extends SingletonEntityService<TestBody> {
  protected parseBody(content: string): TestBody {
    const lines = content.split("\n");
    return {
      title: lines[0] ?? "untitled",
      description: lines[1] ?? "",
    };
  }

  protected createContent(body: TestBody): string {
    return `${body.title}\n${body.description}`;
  }
}

function createMockEntityService(): EntityService {
  return {
    getEntity: async () => null,
    getEntityRaw: async () => null,
    listEntities: async () => [],
    search: async () => [],
    getEntityTypes: () => [],
    hasEntityType: () => false,
    countEntities: async () => 0,
    getEntityCounts: async () => [],
    getWeightMap: () => ({}),
    createEntity: async () => ({ entityId: "test", jobId: "job-123" }),
    updateEntity: async () => ({ entityId: "test", jobId: "job-123" }),
    deleteEntity: async () => true,
    upsertEntity: async () => ({
      entityId: "test",
      jobId: "job-123",
      created: true,
    }),
    serializeEntity: () => "",
    deserializeEntity: () => ({}),
    getAsyncJobStatus: async () => null,
    storeEmbedding: async () => undefined,
  };
}

describe("SingletonEntityService", () => {
  const defaultBody: TestBody = {
    title: "Default Title",
    description: "Default description",
  };
  const entityType = "test-entity";

  let mockEntityService: EntityService;
  let service: TestSingletonService;
  let getEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let createEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    mockEntityService = createMockEntityService();
    getEntitySpy = spyOn(
      mockEntityService,
      "getEntity",
    ) as unknown as typeof getEntitySpy;
    createEntitySpy = spyOn(
      mockEntityService,
      "createEntity",
    ) as unknown as typeof createEntitySpy;

    service = new TestSingletonService(
      mockEntityService,
      createSilentLogger(),
      entityType,
      defaultBody,
    );
  });

  describe("get", () => {
    it("should return default body when cache is empty", () => {
      const body = service.get();
      expect(body).toEqual(defaultBody);
    });

    it("should return parsed body from cache when entity exists", async () => {
      const mockEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: "Cached Title\nCached description",
      });
      getEntitySpy.mockResolvedValue(mockEntity);

      await service.initialize();

      const body = service.get();
      expect(body).toEqual({
        title: "Cached Title",
        description: "Cached description",
      });
    });
  });

  describe("getContent", () => {
    it("should return created content from default when cache is empty", () => {
      const content = service.getContent();
      expect(content).toBe("Default Title\nDefault description");
    });

    it("should return raw content from cache when entity exists", async () => {
      const rawContent = "Raw cached content\nSome description";
      const mockEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: rawContent,
      });
      getEntitySpy.mockResolvedValue(mockEntity);

      await service.initialize();

      expect(service.getContent()).toBe(rawContent);
    });
  });

  describe("initialize", () => {
    it("should create default entity when none exists", async () => {
      getEntitySpy.mockResolvedValue(null);

      await service.initialize();

      expect(createEntitySpy).toHaveBeenCalledTimes(1);

      const createCall = createEntitySpy.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(createCall).toMatchObject({
        id: entityType,
        entityType,
      });
      expect(createCall?.["content"]).toBe(
        "Default Title\nDefault description",
      );
    });

    it("should not create entity when one already exists", async () => {
      const mockEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: "Existing\nEntity",
      });
      getEntitySpy.mockResolvedValue(mockEntity);

      await service.initialize();

      expect(createEntitySpy).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      getEntitySpy.mockResolvedValue(null);
      createEntitySpy.mockRejectedValue(new Error("Database error"));

      await service.initialize();
    });

    it("should reload cache after creating default entity", async () => {
      const createdEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: "Default Title\nDefault description",
      });

      let callCount = 0;
      getEntitySpy.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? null : createdEntity;
      });

      await service.initialize();

      expect(getEntitySpy).toHaveBeenCalledTimes(2);
      expect(service.getContent()).toBe("Default Title\nDefault description");
    });
  });

  describe("refreshCache", () => {
    it("should reload entity from database", async () => {
      const mockEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: "Refreshed Title\nRefreshed description",
      });
      getEntitySpy.mockResolvedValue(mockEntity);

      await service.refreshCache();

      expect(getEntitySpy).toHaveBeenCalledWith(entityType, entityType);
      expect(service.get()).toEqual({
        title: "Refreshed Title",
        description: "Refreshed description",
      });
    });

    it("should clear cache when entity no longer exists", async () => {
      const mockEntity = createTestEntity<BaseEntity>(entityType, {
        id: entityType,
        content: "Cached\nContent",
      });
      getEntitySpy.mockResolvedValue(mockEntity);
      await service.refreshCache();
      expect(service.get().title).toBe("Cached");

      getEntitySpy.mockResolvedValue(null);
      await service.refreshCache();

      expect(service.get()).toEqual(defaultBody);
    });

    it("should handle load errors gracefully", async () => {
      getEntitySpy.mockRejectedValue(new Error("Connection error"));

      await service.refreshCache();

      expect(service.get()).toEqual(defaultBody);
    });
  });

  describe("custom default body", () => {
    it("should use provided custom default body", () => {
      const customBody: TestBody = {
        title: "Custom Title",
        description: "Custom description",
      };

      const customService = new TestSingletonService(
        mockEntityService,
        createSilentLogger(),
        entityType,
        customBody,
      );

      expect(customService.get()).toEqual(customBody);
    });

    it("should create entity with custom default body when none exists", async () => {
      const customBody: TestBody = {
        title: "Custom",
        description: "Custom desc",
      };
      const customService = new TestSingletonService(
        mockEntityService,
        createSilentLogger(),
        entityType,
        customBody,
      );

      getEntitySpy.mockResolvedValue(null);

      await customService.initialize();

      const createCall = createEntitySpy.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(createCall?.["content"]).toBe("Custom\nCustom desc");
    });
  });
});
