import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import type { Logger } from "@brains/utils";
import type { PluginContext } from "@brains/core";
import type { DirectorySync } from "../../src/directorySync";
import type { BaseEntity } from "@brains/types";
import type { RawEntity } from "../../src/types";
import { createSilentLogger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";

describe("DirectoryImportJobHandler", () => {
  let handler: DirectoryImportJobHandler;
  let mockLogger: Logger;
  let mockContext: PluginContext;
  let mockDirectorySync: DirectorySync;

  beforeEach(() => {
    // Create mocks
    mockLogger = createSilentLogger();

    // Mock DirectorySync
    mockDirectorySync = {
      getAllMarkdownFiles: mock(() => [
        "base/entity1.md",
        "base/entity2.md",
        "note/note1.md",
      ]),
      readEntity: mock((path: string): Promise<RawEntity> => {
        if (path === "base/entity1.md") {
          return Promise.resolve({
            id: "entity1",
            entityType: "base",
            content: "# Entity 1\n\nContent 1",
            created: new Date("2024-01-01"),
            updated: new Date("2024-01-02"),
          });
        } else if (path === "base/entity2.md") {
          return Promise.resolve({
            id: "entity2",
            entityType: "base",
            content: "# Entity 2\n\nContent 2",
            created: new Date("2024-01-01"),
            updated: new Date("2024-01-03"),
          });
        } else if (path === "note/note1.md") {
          return Promise.resolve({
            id: "note1",
            entityType: "note",
            content: "# Note 1\n\nNote content",
            created: new Date("2024-01-01"),
            updated: new Date("2024-01-02"),
          });
        }
        throw new Error("File not found");
      }),
    } as unknown as DirectorySync;

    // Mock PluginContext
    mockContext = {
      entityService: {
        getEntityTypes: mock(() => ["base", "note"]),
        deserializeEntity: mock((content: string, entityType: string) => {
          // Simple mock deserialization
          return { title: content.split("\n")[0].replace("# ", "") };
        }),
        getEntity: mock((entityType: string, id: string) => {
          // Return null for new entities, existing entity for entity2
          if (id === "entity2") {
            return Promise.resolve({
              id: "entity2",
              entityType: "base",
              content: "Old content",
              updated: "2024-01-01T00:00:00Z",
            } as BaseEntity);
          }
          return Promise.resolve(null);
        }),
        createEntity: mock(() =>
          Promise.resolve({ entityId: "test-id", jobId: "job-123" }),
        ),
        updateEntity: mock(() =>
          Promise.resolve({ entityId: "test-id", jobId: "job-123" }),
        ),
        getAsyncJobStatus: mock(() => Promise.resolve({ status: "completed" })),
      },
    } as unknown as PluginContext;

    handler = new DirectoryImportJobHandler(
      mockLogger,
      mockContext,
      mockDirectorySync,
    );
  });

  describe("validateAndParse", () => {
    test("should parse valid data with defaults", () => {
      const data = {};
      const result = handler.validateAndParse(data);
      expect(result).toEqual({
        paths: undefined,
        batchSize: 100,
      });
    });

    test("should parse valid data with paths", () => {
      const data = {
        paths: ["base/entity1.md"],
        batchSize: 50,
      };
      const result = handler.validateAndParse(data);
      expect(result).toEqual({
        paths: ["base/entity1.md"],
        batchSize: 50,
      });
    });

    test("should return null for invalid data", () => {
      const data = {
        paths: "not an array",
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
    test("should import all files successfully", async () => {
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

      expect(result.imported).toBe(3); // 2 new entities + 1 updated
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Check entity operations
      expect(mockContext.entityService.createEntity).toHaveBeenCalledTimes(2);
      expect(mockContext.entityService.updateEntity).toHaveBeenCalledTimes(1);
    });

    test("should import specific paths", async () => {
      const jobId = "test-job-124";
      const data = {
        paths: ["base/entity1.md"],
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

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);

      // Check only specified file was processed
      expect(mockDirectorySync.readEntity).toHaveBeenCalledWith(
        "base/entity1.md",
      );
      expect(mockDirectorySync.readEntity).toHaveBeenCalledTimes(1);
    });

    test("should skip entities with unregistered types", async () => {
      // Mock unregistered entity type
      mockContext.entityService.getEntityTypes = mock(() => ["base"]); // note is not registered

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

      expect(result.imported).toBe(2); // Only base entities
      expect(result.skipped).toBe(1); // note entity skipped
      expect(result.failed).toBe(0);
    });

    test("should skip entities that fail deserialization", async () => {
      // Make deserializeEntity throw for specific content
      mockContext.entityService.deserializeEntity = mock((content: string) => {
        if (content.includes("Entity 2")) {
          throw new Error("Deserialization failed");
        }
        return { title: content.split("\n")[0].replace("# ", "") };
      });

      const jobId = "test-job-126";
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

      expect(result.imported).toBe(2); // entity1 and note1
      expect(result.skipped).toBe(1); // entity2 skipped
      expect(result.failed).toBe(0);
    });

    test("should handle read failures gracefully", async () => {
      // Add a file that will fail to read
      mockDirectorySync.getAllMarkdownFiles = mock(() => [
        "base/entity1.md",
        "base/missing.md",
      ]);

      const jobId = "test-job-127";
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

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        path: "base/missing.md",
        error: "File not found",
      });
    });

    test("should skip entities that haven't been modified", async () => {
      // Make all entities exist with recent timestamps
      mockContext.entityService.getEntity = mock(() =>
        Promise.resolve({
          id: "any",
          entityType: "base",
          content: "Current content",
          updated: "2024-01-05T00:00:00Z", // Newer than file dates
        } as BaseEntity),
      );

      const jobId = "test-job-128";
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

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(3); // All skipped
      expect(result.failed).toBe(0);

      // No creates or updates should have been called
      expect(mockContext.entityService.createEntity).not.toHaveBeenCalled();
      expect(mockContext.entityService.updateEntity).not.toHaveBeenCalled();
    });

    test("should process files in batches", async () => {
      // Create many files to test batching
      const manyFiles = Array.from(
        { length: 25 },
        (_, i) => `base/entity${i}.md`,
      );
      mockDirectorySync.getAllMarkdownFiles = mock(() => manyFiles);
      mockDirectorySync.readEntity = mock((path: string) =>
        Promise.resolve({
          id: path.replace(".md", "").split("/")[1],
          entityType: "base",
          content: `# Entity\n\nContent for ${path}`,
          created: new Date("2024-01-01"),
          updated: new Date("2024-01-02"),
        }),
      );

      const jobId = "test-job-129";
      const data = {
        batchSize: 10, // Small batch size
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

      expect(result.imported).toBe(25);
      expect(result.failed).toBe(0);
    });
  });

  describe("onError", () => {
    test("should handle errors gracefully", async () => {
      const error = new Error("Job processing failed");
      const data = { batchSize: 100 };
      const jobId = "test-job-130";

      // Should not throw
      await expect(
        handler.onError(error, data, jobId),
      ).resolves.toBeUndefined();
    });
  });
});
