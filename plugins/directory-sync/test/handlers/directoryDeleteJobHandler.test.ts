import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryDeleteJobHandler } from "../../src/handlers/directoryDeleteJobHandler";
import type { ServicePluginContext, ProgressReporter } from "@brains/plugins";
import type { DirectorySync } from "../../src/lib/directory-sync";
import type { IEntityService } from "@brains/plugins";
import { createSilentLogger } from "@brains/utils";

describe("DirectoryDeleteJobHandler", () => {
  const logger = createSilentLogger();
  let handler: DirectoryDeleteJobHandler;
  let mockContext: ServicePluginContext;
  let mockDirectorySync: DirectorySync;
  let mockEntityService: IEntityService;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockEntityService = {
      deleteEntity: mock().mockResolvedValue(true),
      getEntity: mock().mockResolvedValue(null),
    } as unknown as IEntityService;

    mockContext = {
      entityService: mockEntityService,
      logger: logger,
    } as unknown as ServicePluginContext;

    mockDirectorySync = {} as DirectorySync;

    mockProgressReporter = {
      report: mock().mockResolvedValue(undefined),
    } as unknown as ProgressReporter;

    handler = new DirectoryDeleteJobHandler(
      logger,
      mockContext,
      mockDirectorySync,
    );
  });

  describe("process", () => {
    const validData = {
      entityId: "technology:ai",
      entityType: "topic",
      filePath: "/path/to/topic/technology/ai.md",
    };
    const jobId = "test-job-123";

    it("should successfully delete an existing entity", async () => {
      mockEntityService.deleteEntity = mock().mockResolvedValue(true);

      const result = await handler.process(
        validData,
        jobId,
        mockProgressReporter,
      );

      expect(mockEntityService.deleteEntity).toHaveBeenCalledWith(
        "topic",
        "technology:ai",
      );
      expect(result).toEqual({
        deleted: true,
        entityId: "technology:ai",
        entityType: "topic",
        filePath: "/path/to/topic/technology/ai.md",
      });
      // Logger is silent, no need to test its calls
      expect(mockProgressReporter.report).toHaveBeenCalledTimes(2);
    });

    it("should handle case when entity doesn't exist", async () => {
      mockEntityService.deleteEntity = mock().mockResolvedValue(false);

      const result = await handler.process(
        validData,
        jobId,
        mockProgressReporter,
      );

      expect(mockEntityService.deleteEntity).toHaveBeenCalledWith(
        "topic",
        "technology:ai",
      );
      expect(result).toEqual({
        deleted: false,
        entityId: "technology:ai",
        entityType: "topic",
        filePath: "/path/to/topic/technology/ai.md",
      });
      // Logger is silent, no need to test its calls
    });

    it("should handle deletion errors gracefully", async () => {
      const error = new Error("Database connection failed");
      mockEntityService.deleteEntity = mock().mockRejectedValue(error);

      const promise = handler.process(validData, jobId, mockProgressReporter);
      await expect(promise).rejects.toThrow("Database connection failed");

      // Logger is silent, no need to test its calls
    });

    it("should reject invalid data", async () => {
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
      await expect(promise).rejects.toThrow();
    });

    it("should report progress correctly", async () => {
      mockEntityService.deleteEntity = mock().mockResolvedValue(true);

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
      const error = new Error("Test error");
      const data = {
        entityId: "test-id",
        entityType: "test-type",
        filePath: "/test/path.md",
      };
      const jobId = "job-456";

      await handler.onError(error, data, jobId);

      // Logger is silent, no need to test its calls
    });
  });
});
