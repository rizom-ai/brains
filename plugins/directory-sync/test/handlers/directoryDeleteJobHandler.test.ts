import { describe, it, expect, mock } from "bun:test";
import { DirectoryDeleteJobHandler } from "../../src/handlers/directoryDeleteJobHandler";
import type { IDirectorySync } from "../../src/types";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createMockProgressReporter,
} from "@brains/test-utils";

describe("DirectoryDeleteJobHandler", () => {
  const logger = createSilentLogger();
  const mockDirectorySync: IDirectorySync = {
    importEntitiesWithProgress: mock(() =>
      Promise.resolve({
        imported: 0,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: [],
      }),
    ),
    exportEntitiesWithProgress: mock(() =>
      Promise.resolve({ exported: 0, failed: 0, errors: [] }),
    ),
    getAllMarkdownFiles: mock(() => []),
    processEntityExport: mock(() => Promise.resolve({ success: true })),
    fileOps: {
      readEntity: mock(() => Promise.resolve({} as never)),
      parseEntityFromPath: mock(() => ({ entityType: "note", id: "test" })),
    },
  };

  const validData = {
    entityId: "technology:ai",
    entityType: "topic",
    filePath: "/path/to/topic/technology/ai.md",
  };
  const jobId = "test-job-123";

  describe("process", () => {
    it("should successfully delete an existing entity", async () => {
      const mockContext = createMockServicePluginContext({
        returns: { entityService: { deleteEntity: true } },
      });
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );

      const result = await handler.process(
        validData,
        jobId,
        mockProgressReporter,
      );

      expect(mockContext.entityService.deleteEntity).toHaveBeenCalledWith(
        "topic",
        "technology:ai",
      );
      expect(result).toEqual({
        deleted: true,
        entityId: "technology:ai",
        entityType: "topic",
        filePath: "/path/to/topic/technology/ai.md",
      });
      expect(mockProgressReporter.report).toHaveBeenCalledTimes(2);
    });

    it("should handle case when entity doesn't exist", async () => {
      const mockContext = createMockServicePluginContext({
        returns: { entityService: { deleteEntity: false } },
      });
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );

      const result = await handler.process(
        validData,
        jobId,
        mockProgressReporter,
      );

      expect(mockContext.entityService.deleteEntity).toHaveBeenCalledWith(
        "topic",
        "technology:ai",
      );
      expect(result).toEqual({
        deleted: false,
        entityId: "technology:ai",
        entityType: "topic",
        filePath: "/path/to/topic/technology/ai.md",
      });
    });

    it("should handle deletion errors gracefully", async () => {
      const mockContext = createMockServicePluginContext();
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );
      // Configure mock to reject - requires minimal cast for mock method access
      const deleteEntityMock = mockContext.entityService
        .deleteEntity as ReturnType<typeof import("bun:test").mock>;
      deleteEntityMock.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const promise = handler.process(validData, jobId, mockProgressReporter);
      expect(promise).rejects.toThrow("Database connection failed");
    });

    it("should reject invalid data", async () => {
      const mockContext = createMockServicePluginContext();
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );

      const invalidData = {
        entityType: "topic",
        filePath: "/path/to/file.md",
        // missing entityId
      };

      const promise = handler.process(
        invalidData as unknown as typeof validData,
        jobId,
        mockProgressReporter,
      );
      expect(promise).rejects.toThrow();
    });

    it("should report progress correctly", async () => {
      const mockContext = createMockServicePluginContext({
        returns: { entityService: { deleteEntity: true } },
      });
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );

      await handler.process(validData, jobId, mockProgressReporter);

      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 0,
        total: 1,
        message: "Deleting topic:technology:ai",
      });
      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 1,
        total: 1,
        message: "Deleted topic:technology:ai",
      });
    });
  });

  describe("onError", () => {
    it("should log error details", async () => {
      const mockContext = createMockServicePluginContext();
      const mockProgressReporter = createMockProgressReporter();
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        mockDirectorySync,
      );

      const error = new Error("Test error");
      const data = {
        entityId: "test-id",
        entityType: "test-type",
        filePath: "/test/path.md",
      };
      const jobId = "job-456";

      await handler.onError(error, data, jobId, mockProgressReporter);

      // Logger is silent, no need to test its calls
    });
  });
});
