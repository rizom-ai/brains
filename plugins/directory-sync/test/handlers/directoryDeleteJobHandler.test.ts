import { describe, it, expect, mock } from "bun:test";
import { DirectoryDeleteJobHandler } from "../../src/handlers/directoryDeleteJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createMockProgressReporter,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectoryDeleteJobHandler", () => {
  const logger = createSilentLogger();
  const mockDirectorySync = createMockDirectorySync();

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
      const completePendingDelete = mock(() => {});
      const directorySync = createMockDirectorySync({
        completePendingDelete,
      });
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        directorySync,
      );

      const result = await handler.process(
        validData,
        jobId,
        mockProgressReporter,
      );

      expect(mockContext.entityService.deleteEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "technology:ai",
        options: { persistenceOrigin: "directory-sync" },
      });
      expect(result).toEqual({
        deleted: true,
        entityId: "technology:ai",
        entityType: "topic",
        filePath: "/path/to/topic/technology/ai.md",
      });
      expect(mockProgressReporter.report).toHaveBeenCalledTimes(2);
      expect(completePendingDelete).toHaveBeenCalledWith(
        "topic",
        "technology:ai",
        "/path/to/topic/technology/ai.md",
      );
    });

    it("deletes a targeted batch in one job", async () => {
      const mockContext = createMockServicePluginContext({
        returns: { entityService: { deleteEntity: true } },
      });
      const mockProgressReporter = createMockProgressReporter();
      const completePendingDelete = mock(() => {});
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        createMockDirectorySync({ completePendingDelete }),
      );
      const deletions = [
        validData,
        {
          entityId: "second",
          entityType: "note",
          filePath: "/path/to/second.md",
        },
      ];

      const result = await handler.process(
        { deletions },
        jobId,
        mockProgressReporter,
      );

      expect(result).toEqual([
        {
          deleted: true,
          entityId: validData.entityId,
          entityType: validData.entityType,
          filePath: validData.filePath,
        },
        {
          deleted: true,
          entityId: "second",
          entityType: "note",
          filePath: "/path/to/second.md",
        },
      ]);
      expect(mockContext.entityService.deleteEntity).toHaveBeenCalledTimes(2);
      expect(completePendingDelete).toHaveBeenCalledTimes(2);
      expect(mockProgressReporter.report).toHaveBeenLastCalledWith({
        progress: 2,
        total: 2,
        message: "Deleted note:second",
      });
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

      expect(mockContext.entityService.deleteEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "technology:ai",
        options: { persistenceOrigin: "directory-sync" },
      });
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
      const completePendingDelete = mock(() => {});
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        createMockDirectorySync({ completePendingDelete }),
      );
      // Configure mock to reject - requires minimal cast for mock method access
      const deleteEntityMock = mockContext.entityService
        .deleteEntity as ReturnType<typeof mock>;
      deleteEntityMock.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const error = await handler
        .process(validData, jobId, mockProgressReporter)
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ message: "Database connection failed" });
      expect(completePendingDelete).not.toHaveBeenCalled();
    });

    it("should reject invalid data", async () => {
      const mockContext = createMockServicePluginContext();
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

      // validateAndParse is the member built to take untrusted payloads —
      // BaseJobHandler runs it before a job is durably enqueued, so this is the
      // guard that actually keeps malformed data out of the queue. It accepts
      // unknown, so the invalid object goes in as it is, with no cast.
      expect(handler.validateAndParse(invalidData)).toBeNull();
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

      await handler.onError(
        error,
        data,
        jobId,
        mockProgressReporter,
        new AbortController().signal,
      );

      // Logger is silent, no need to test its calls
    });
  });
});
