import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { DirectoryExportJobHandler } from "../../src/handlers/directoryExportJobHandler";
import type { Logger } from "@brains/utils";
import type { PluginContext } from "@brains/core";
import type { DirectorySync } from "../../src/directorySync";
import type { BaseEntity } from "@brains/types";
import { createSilentLogger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";

describe("DirectoryExportJobHandler", () => {
  let handler: DirectoryExportJobHandler;
  let mockLogger: Logger;
  let mockContext: PluginContext;
  let mockDirectorySync: DirectorySync;

  beforeEach(() => {
    // Reset singleton
    DirectoryExportJobHandler.resetInstance();

    // Create mocks
    mockLogger = createSilentLogger();

    // Mock DirectorySync
    mockDirectorySync = {
      writeEntity: mock(() => Promise.resolve()),
    } as unknown as DirectorySync;

    // Mock PluginContext
    mockContext = {
      entityService: {
        getEntityTypes: mock(() => ["base", "note"]),
        listEntities: mock((entityType: string, options: any) => {
          // Return mock entities based on pagination
          const offset = options?.offset || 0;
          const limit = options?.limit || 100;

          if (entityType === "base" && offset === 0) {
            return Promise.resolve([
              { id: "entity1", entityType: "base", content: "Test 1" },
              { id: "entity2", entityType: "base", content: "Test 2" },
            ] as BaseEntity[]);
          } else if (entityType === "note" && offset === 0) {
            return Promise.resolve([
              { id: "note1", entityType: "note", content: "Note 1" },
            ] as BaseEntity[]);
          }
          return Promise.resolve([]);
        }),
      },
    } as unknown as PluginContext;

    handler = DirectoryExportJobHandler.createFresh(
      mockLogger,
      mockContext,
      mockDirectorySync,
    );
  });

  describe("getInstance", () => {
    test("should return singleton instance", () => {
      const instance1 = DirectoryExportJobHandler.getInstance(
        mockLogger,
        mockContext,
        mockDirectorySync,
      );
      const instance2 = DirectoryExportJobHandler.getInstance(
        mockLogger,
        mockContext,
        mockDirectorySync,
      );
      expect(instance1).toBe(instance2);
    });

    test("should create new instance after reset", () => {
      const instance1 = DirectoryExportJobHandler.getInstance(
        mockLogger,
        mockContext,
        mockDirectorySync,
      );
      DirectoryExportJobHandler.resetInstance();
      const instance2 = DirectoryExportJobHandler.getInstance(
        mockLogger,
        mockContext,
        mockDirectorySync,
      );
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("validateAndParse", () => {
    test("should parse valid data with defaults", () => {
      const data = {};
      const result = handler.validateAndParse(data);
      expect(result).toEqual({
        entityTypes: undefined,
        batchSize: 100,
      });
    });

    test("should parse valid data with entity types", () => {
      const data = {
        entityTypes: ["base", "note"],
        batchSize: 50,
      };
      const result = handler.validateAndParse(data);
      expect(result).toEqual({
        entityTypes: ["base", "note"],
        batchSize: 50,
      });
    });

    test("should return null for invalid data", () => {
      const data = {
        batchSize: "not a number",
      };
      const result = handler.validateAndParse(data);
      expect(result).toBeNull();
    });

    test("should return null for negative batch size", () => {
      const data = {
        batchSize: -1,
      };
      const result = handler.validateAndParse(data);
      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    test("should export all entities successfully", async () => {
      const jobId = "test-job-123";
      const data = { batchSize: 100 };

      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback() {
          return async () => {};
        },
      } as unknown as ProgressReporter;
      const result = await handler.process(data, jobId, mockProgressReporter);

      expect(result.exported).toBe(3); // 2 base + 1 note
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Check writeEntity was called for each entity
      expect(mockDirectorySync.writeEntity).toHaveBeenCalledTimes(3);
    });

    test("should export specific entity types", async () => {
      const jobId = "test-job-124";
      const data = {
        entityTypes: ["note"],
        batchSize: 100,
      };

      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback() {
          return async () => {};
        },
      } as unknown as ProgressReporter;
      const result = await handler.process(data, jobId, mockProgressReporter);

      expect(result.exported).toBe(1); // Only 1 note
      expect(result.failed).toBe(0);

      // Check only note entities were processed
      expect(mockContext.entityService.listEntities).toHaveBeenCalledWith(
        "note",
        expect.any(Object),
      );
      expect(mockContext.entityService.listEntities).not.toHaveBeenCalledWith(
        "base",
        expect.any(Object),
      );
    });

    test("should handle export failures gracefully", async () => {
      // Make writeEntity throw an error for specific entity
      mockDirectorySync.writeEntity = mock((entity: BaseEntity) => {
        if (entity.id === "entity2") {
          throw new Error("Write failed");
        }
        return Promise.resolve();
      });

      const jobId = "test-job-125";
      const data = { batchSize: 100 };

      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback() {
          return async () => {};
        },
      } as unknown as ProgressReporter;
      const result = await handler.process(data, jobId, mockProgressReporter);

      expect(result.exported).toBe(2); // 1 base + 1 note succeeded
      expect(result.failed).toBe(1); // 1 base failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        entityId: "entity2",
        entityType: "base",
        error: "Write failed",
      });
    });

    test("should process entities in batches", async () => {
      // Create many entities to test batching
      const manyEntities = Array.from({ length: 150 }, (_, i) => ({
        id: `entity${i}`,
        entityType: "base",
        content: `Test ${i}`,
      })) as BaseEntity[];

      mockContext.entityService.listEntities = mock(
        (entityType: string, options: any) => {
          if (entityType === "base") {
            const offset = options?.offset || 0;
            const limit = options?.limit || 100;
            return Promise.resolve(manyEntities.slice(offset, offset + limit));
          }
          return Promise.resolve([]);
        },
      );

      const jobId = "test-job-126";
      const data = {
        entityTypes: ["base"],
        batchSize: 50,
      };

      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback() {
          return async () => {};
        },
      } as unknown as ProgressReporter;
      const result = await handler.process(data, jobId, mockProgressReporter);

      expect(result.exported).toBe(150);
      expect(result.failed).toBe(0);

      // Check listEntities was called multiple times for pagination
      expect(mockContext.entityService.listEntities).toHaveBeenCalledTimes(4); // 0, 50, 100, 150
    });
  });

  describe("onError", () => {
    test("should handle errors gracefully", async () => {
      const error = new Error("Job processing failed");
      const data = { batchSize: 100 };
      const jobId = "test-job-127";

      // Should not throw
      await expect(
        handler.onError(error, data, jobId),
      ).resolves.toBeUndefined();
    });
  });
});
