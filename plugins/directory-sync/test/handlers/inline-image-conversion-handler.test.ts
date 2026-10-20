import { createMockServicePluginContext } from "@brains/plugins/test";
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
  let dir: string;
  let postPath: string;

  /** The post on disk the handler reads and rewrites. */
  const givenPost = (markdown: string): void => {
    writeFileSync(postPath, markdown);
  };
  const savedPost = (): string => readFileSync(postPath, "utf-8");
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
    handler = new InlineImageConversionJobHandler(context, logger, mockFetcher);
    progressReporter = createProgressReporter();

    dir = mkdtempSync(join(tmpdir(), "inline-image-conversion-"));
    postPath = join(dir, "post.md");
  });

  afterEach(() => {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  });

  describe("process", () => {
    it("should skip if no inline images found", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just plain text without images.`;

      givenPost(content);

      const result = await handler.process(
        { filePath: postPath, postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.convertedCount).toBe(0);
      expect(savedPost()).toBe(content);
    });

    it("should skip already converted entity:// references", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Already converted: ![Alt](entity://image/existing-id)`;

      givenPost(content);

      const result = await handler.process(
        { filePath: postPath, postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(savedPost()).toBe(content);
    });

    it("should convert inline HTTP image to entity reference", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is an image: ![Alt text](https://example.com/image.png)`;

      givenPost(content);

      const result = await handler.process(
        { filePath: postPath, postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.convertedCount).toBe(1);
      expect(mockFetcher).toHaveBeenCalled();

      // The post on disk now carries an entity:// reference
      const writtenContent = savedPost();
      expect(writtenContent).toContain("entity://image/");
      expect(writtenContent).not.toContain("https://example.com/image.png");
    });

    it("should handle file read errors gracefully", async () => {
      const result = await handler.process(
        { filePath: join(dir, "missing.md"), postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("no such file or directory");
    });

    // A read-only directory refuses the write unless the tests run as root.
    it.skipIf(process.getuid?.() === 0)(
      "should handle file write errors gracefully",
      async () => {
        const content = `---
title: Test Post
slug: test-post
---

![Image](https://example.com/image.png)`;

        givenPost(content);
        chmodSync(dir, 0o555);

        const result = await handler.process(
          { filePath: postPath, postSlug: "test-post" },
          "job-123",
          progressReporter,
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("permission denied");
        expect(savedPost()).toBe(content);
      },
    );

    it("should report progress throughout the process", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just text.`;

      givenPost(content);

      await handler.process(
        { filePath: postPath, postSlug: "test-post" },
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

      givenPost(content);

      const result = await handler.process(
        { filePath: postPath, postSlug: "test-post" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(savedPost()).toBe(content);
    });
  });
});
