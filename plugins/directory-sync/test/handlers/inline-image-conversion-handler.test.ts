import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import * as fs from "fs";
import { InlineImageConversionJobHandler } from "../../src/handlers/inline-image-conversion-handler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { ProgressReporter, type ProgressNotification } from "@brains/utils";

// Valid 1x1 PNG image as base64 data URL
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("InlineImageConversionJobHandler", () => {
  let handler: InlineImageConversionJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: ProgressNotification[];
  let readFileSyncSpy: ReturnType<typeof spyOn>;
  let writeFileSyncSpy: ReturnType<typeof spyOn>;
  let mockFetcher: ReturnType<typeof mock>;

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = ProgressReporter.from(
      async (notification: ProgressNotification) => {
        progressCalls.push(notification);
      },
    );
    if (!reporter) {
      throw new Error("Failed to create progress reporter");
    }
    return reporter;
  };

  beforeEach(() => {
    logger = createSilentLogger();
    context = createMockServicePluginContext({
      returns: {
        entityService: {
          listEntities: [],
          createEntity: { entityId: "test-image-id", jobId: "job-1" },
        },
      },
    });

    mockFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));
    handler = new InlineImageConversionJobHandler(context, logger, mockFetcher);
    progressReporter = createProgressReporter();

    // Mock file system operations
    readFileSyncSpy = spyOn(fs, "readFileSync");
    writeFileSyncSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});
  });

  afterEach(() => {
    readFileSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });

  describe("process", () => {
    it("should skip if no inline images found", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just plain text without images.`;

      readFileSyncSpy.mockReturnValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.convertedCount).toBe(0);
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it("should skip already converted entity:// references", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Already converted: ![Alt](entity://image/existing-id)`;

      readFileSyncSpy.mockReturnValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it("should convert inline HTTP image to entity reference", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is an image: ![Alt text](https://example.com/image.png)`;

      readFileSyncSpy.mockReturnValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.convertedCount).toBe(1);
      expect(writeFileSyncSpy).toHaveBeenCalled();
      expect(mockFetcher).toHaveBeenCalled();

      // Check that the written content has entity:// reference
      const writtenContent = writeFileSyncSpy.mock.calls[0]?.[1] as string;
      expect(writtenContent).toContain("entity://image/");
      expect(writtenContent).not.toContain("https://example.com/image.png");
    });

    it("should handle file read errors gracefully", async () => {
      readFileSyncSpy.mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = await handler.process(
        { filePath: "/path/to/missing.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("File not found");
    });

    it("should handle file write errors gracefully", async () => {
      const content = `---
title: Test Post
slug: test-post
---

![Image](https://example.com/image.png)`;

      readFileSyncSpy.mockReturnValue(content);
      writeFileSyncSpy.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Permission denied");
    });

    it("should report progress throughout the process", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just text.`;

      readFileSyncSpy.mockReturnValue(content);

      await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      // Should have progress updates
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]?.progress).toBe(10);
      expect(progressCalls[progressCalls.length - 1]?.progress).toBe(100);
    });

    it("should skip images in code blocks", async () => {
      const content = `---
title: Test Post
slug: test-post
---

\`\`\`markdown
![Code image](https://example.com/code.png)
\`\`\`

No real images here.`;

      readFileSyncSpy.mockReturnValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });
  });
});
