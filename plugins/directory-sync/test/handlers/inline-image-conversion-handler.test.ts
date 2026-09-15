import assert from "node:assert/strict";
import { installRemoteFileAssets } from "../helpers/file-assets";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import * as fsp from "fs/promises";
import { InlineImageConversionJobHandler } from "../../src/handlers/inline-image-conversion-handler";
import { createSilentLogger } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  CallbackProgressReporter,
  type ProgressReporter,
  type ProgressNotification,
} from "@brains/utils/progress";
import { TINY_PNG_DATA_URL as VALID_PNG_DATA_URL } from "../fixtures";

describe("InlineImageConversionJobHandler", () => {
  let handler: InlineImageConversionJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: ProgressNotification[];
  let readFileSpy: ReturnType<typeof spyOn>;
  let writeFileSpy: ReturnType<typeof spyOn>;
  let mockFetcher: ReturnType<typeof mock>;

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = CallbackProgressReporter.from(
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
          createEntity: {
            entityId: "test-image-id",
            jobId: "job-1",
            skipped: false,
          },
        },
      },
    });

    mockFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));
    installRemoteFileAssets(context.entityService, mockFetcher);
    handler = new InlineImageConversionJobHandler(context, logger);
    progressReporter = createProgressReporter();

    // Mock file system operations
    readFileSpy = spyOn(fsp, "readFile");
    writeFileSpy = spyOn(fsp, "writeFile").mockResolvedValue(undefined);
  });

  afterEach(() => {
    readFileSpy.mockRestore();
    writeFileSpy.mockRestore();
  });

  describe("process", () => {
    it("should skip if no inline images found", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just plain text without images.`;

      readFileSpy.mockResolvedValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.convertedCount).toBe(0);
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it("should skip already converted entity:// references", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Already converted: ![Alt](entity://image/existing-id)`;

      readFileSpy.mockResolvedValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it("should convert inline HTTP image to entity reference", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is an image: ![Alt text](https://example.com/image.png)`;

      readFileSpy.mockResolvedValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.convertedCount).toBe(1);
      expect(writeFileSpy).toHaveBeenCalled();
      expect(mockFetcher).toHaveBeenCalled();

      // Check that the written content has entity:// reference
      const writtenContent = z.string().parse(writeFileSpy.mock.calls[0]?.[1]);
      expect(writtenContent).toContain("entity://image/");
      expect(writtenContent).not.toContain("https://example.com/image.png");
    });

    it("joins cancelled ingress without publishing, writing or starting the next image", async () => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const caller = new AbortController();
      const primary = new Error("inline job cancelled");
      mockFetcher.mockImplementation(async (): Promise<string> => {
        entered.resolve();
        await release.promise;
        return VALID_PNG_DATA_URL;
      });
      readFileSpy.mockResolvedValue(
        "![One](https://example.com/one.png)\n![Two](https://example.com/two.png)",
      );
      let settled = false;
      const work = handler
        .process(
          { filePath: "/path/post.md", postSlug: "post" },
          "job",
          progressReporter,
          caller.signal,
        )
        .finally(() => {
          settled = true;
        });
      const rejected = assert.rejects(
        work,
        (error: unknown) => error === primary,
      );
      try {
        await entered.promise;
        caller.abort(primary);
        expect(settled).toBe(false);
      } finally {
        release.resolve();
        await rejected;
      }
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(context.entityService.createEntity).not.toHaveBeenCalled();
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it("should handle file read errors gracefully", async () => {
      readFileSpy.mockRejectedValue(new Error("File not found"));

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

      readFileSpy.mockResolvedValue(content);
      writeFileSpy.mockRejectedValue(new Error("Permission denied"));

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

      readFileSpy.mockResolvedValue(content);

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

      readFileSpy.mockResolvedValue(content);

      const result = await handler.process(
        { filePath: "/path/to/post.md", postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(writeFileSpy).not.toHaveBeenCalled();
    });
  });
});
