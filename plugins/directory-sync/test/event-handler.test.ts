import { describe, it, expect, beforeEach, mock } from "bun:test";
import { EventHandler } from "../src/lib/event-handler";
import type { FileOperations } from "../src/lib/file-operations";
import { createSilentLogger } from "@brains/test-utils";

describe("EventHandler", () => {
  const logger = createSilentLogger();
  let mockImportFn: ReturnType<typeof mock>;
  let mockJobQueueCallback: ReturnType<typeof mock>;
  let mockFileOperations: FileOperations;

  beforeEach(() => {
    mockImportFn = mock().mockResolvedValue(undefined);
    mockJobQueueCallback = mock().mockResolvedValue("job-123");

    mockFileOperations = {
      parseEntityFromPath: mock().mockReturnValue({
        entityType: "topic",
        id: "technology:ai",
      }),
    } as unknown as FileOperations;
  });

  describe("with job queue callback", () => {
    let eventHandler: EventHandler;

    beforeEach(() => {
      eventHandler = new EventHandler(
        logger,
        mockImportFn,
        mockJobQueueCallback,
        mockFileOperations,
        true, // deleteOnFileRemoval
      );
    });

    describe("handleFileChange", () => {
      it("should queue import job for 'add' event", async () => {
        await eventHandler.handleFileChange("add", "/test/file.md");

        expect(mockJobQueueCallback).toHaveBeenCalledWith({
          type: "directory-import",
          data: {
            paths: ["/test/file.md"],
          },
        });
        // Logger is silent, no need to test its calls
      });

      it("should queue import job for 'change' event", async () => {
        await eventHandler.handleFileChange("change", "/test/file.md");

        expect(mockJobQueueCallback).toHaveBeenCalledWith({
          type: "directory-import",
          data: {
            paths: ["/test/file.md"],
          },
        });
      });

      it("should queue delete job for 'delete' event", async () => {
        await eventHandler.handleFileChange(
          "delete",
          "/test/topic/technology/ai.md",
        );

        expect(mockFileOperations.parseEntityFromPath).toHaveBeenCalledWith(
          "/test/topic/technology/ai.md",
        );
        expect(mockJobQueueCallback).toHaveBeenCalledWith({
          type: "directory-delete",
          data: {
            entityId: "technology:ai",
            entityType: "topic",
            filePath: "/test/topic/technology/ai.md",
          },
        });
        // Logger is silent, no need to test its calls
      });

      it("should queue delete job for 'unlink' event", async () => {
        await eventHandler.handleFileChange("unlink", "/test/summary/daily.md");

        mockFileOperations.parseEntityFromPath = mock().mockReturnValue({
          entityType: "summary",
          id: "daily",
        });

        await eventHandler.handleFileChange("unlink", "/test/summary/daily.md");

        expect(mockJobQueueCallback).toHaveBeenCalledWith({
          type: "directory-delete",
          data: {
            entityId: "daily",
            entityType: "summary",
            filePath: "/test/summary/daily.md",
          },
        });
      });

      it("should not queue delete job when deleteOnFileRemoval is false", async () => {
        eventHandler = new EventHandler(
          logger,
          mockImportFn,
          mockJobQueueCallback,
          mockFileOperations,
          false, // deleteOnFileRemoval disabled
        );

        await eventHandler.handleFileChange("delete", "/test/file.md");

        expect(mockJobQueueCallback).not.toHaveBeenCalled();
        // Logger is silent, no need to test its calls
      });

      it("should handle parseEntityFromPath errors gracefully", async () => {
        mockFileOperations.parseEntityFromPath = mock().mockImplementation(
          () => {
            throw new Error("Invalid path format");
          },
        );

        await eventHandler.handleFileChange("delete", "/test/invalid.md");

        expect(mockJobQueueCallback).not.toHaveBeenCalled();
        // Logger is silent, no need to test its calls
      });

      it("should handle unknown events", async () => {
        await eventHandler.handleFileChange("unknown", "/test/file.md");

        expect(mockJobQueueCallback).not.toHaveBeenCalled();
        expect(mockImportFn).not.toHaveBeenCalled();
        // Logger is silent, no need to test its calls
      });

      it("should handle errors in event processing", async () => {
        mockJobQueueCallback.mockRejectedValue(new Error("Queue failed"));

        await eventHandler.handleFileChange("add", "/test/file.md");

        // Logger is silent, no need to test its calls
      });
    });
  });

  describe("without job queue callback", () => {
    let eventHandler: EventHandler;

    beforeEach(() => {
      eventHandler = new EventHandler(
        logger,
        mockImportFn,
        undefined, // no job queue
        mockFileOperations,
        true,
      );
    });

    it("should call import function directly for 'add' event", async () => {
      await eventHandler.handleFileChange("add", "/test/file.md");

      expect(mockImportFn).toHaveBeenCalledWith(["/test/file.md"]);
      expect(mockJobQueueCallback).not.toHaveBeenCalled();
    });

    it("should log warning for 'delete' event without job queue", async () => {
      await eventHandler.handleFileChange("delete", "/test/file.md");

      // Logger is silent, no need to test its calls
      expect(mockJobQueueCallback).not.toHaveBeenCalled();
    });
  });
});
