import { createMockShell } from "@brains/plugins/test";
import { hostFor } from "../helpers/install";
import { describe, it, expect, mock, spyOn } from "bun:test";
import { DirectoryDeleteJobHandler } from "../../src/handlers/directoryDeleteJobHandler";
import {
  createSilentLogger,
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
      const mockContext = await hostFor(createMockShell());
      const deleteEntity = spyOn(
        mockContext.mirror,
        "deleteEntity",
      ).mockResolvedValue(true);
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

      expect(deleteEntity).toHaveBeenCalledWith({
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

    it("keeps an entity another of its files still holds, importing that file", async () => {
      const mockContext = await hostFor(createMockShell());
      const deleteEntity = spyOn(
        mockContext.mirror,
        "deleteEntity",
      ).mockResolvedValue(true);
      const importEntities = mock(async () => ({
        imported: 1,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: [],
      }));
      const completePendingDelete = mock(() => {});
      const base = createMockDirectorySync();
      const directorySync = createMockDirectorySync({
        importEntities,
        completePendingDelete,
        fileOps: {
          ...base.fileOps,
          getEntityDeletePaths: (): string[] => [
            "/sync/image/cover.png",
            "/sync/image/cover.jpg",
            "/sync/image/cover.md",
          ],
          fileExists: mock(
            async (path: string) => path === "/sync/image/cover.png",
          ),
        },
      });
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        directorySync,
      );

      const result = await handler.process(
        {
          entityId: "cover",
          entityType: "image",
          filePath: "/sync/image/cover.jpg",
        },
        jobId,
        createMockProgressReporter(),
      );

      expect(deleteEntity).not.toHaveBeenCalled();
      expect(importEntities).toHaveBeenCalledWith(["/sync/image/cover.png"]);
      expect(completePendingDelete).toHaveBeenCalledWith(
        "image",
        "cover",
        "/sync/image/cover.jpg",
      );
      expect(result).toEqual({
        deleted: false,
        entityId: "cover",
        entityType: "image",
        filePath: "/sync/image/cover.jpg",
      });
    });

    it("deletes a targeted batch in one job", async () => {
      const mockContext = await hostFor(createMockShell());
      const deleteEntity = spyOn(
        mockContext.mirror,
        "deleteEntity",
      ).mockResolvedValue(true);
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
      expect(deleteEntity).toHaveBeenCalledTimes(2);
      expect(completePendingDelete).toHaveBeenCalledTimes(2);
      expect(mockProgressReporter.report).toHaveBeenLastCalledWith({
        progress: 2,
        total: 2,
        message: "Deleted note:second",
      });
    });

    it("should handle case when entity doesn't exist", async () => {
      const mockContext = await hostFor(createMockShell());
      const deleteEntity = spyOn(
        mockContext.mirror,
        "deleteEntity",
      ).mockResolvedValue(false);
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

      expect(deleteEntity).toHaveBeenCalledWith({
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
      const mockContext = await hostFor(createMockShell());
      const mockProgressReporter = createMockProgressReporter();
      const completePendingDelete = mock(() => {});
      const handler = new DirectoryDeleteJobHandler(
        logger,
        mockContext,
        createMockDirectorySync({ completePendingDelete }),
      );
      spyOn(mockContext.mirror, "deleteEntity").mockRejectedValue(
        new Error("Database connection failed"),
      );

      const error = await handler
        .process(validData, jobId, mockProgressReporter)
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ message: "Database connection failed" });
      expect(completePendingDelete).not.toHaveBeenCalled();
    });

    it("should report progress correctly", async () => {
      const mockContext = await hostFor(createMockShell());
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
});
