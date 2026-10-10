import { createTestEntity } from "@brains/entity-service/test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CoverImageConversionJobHandler,
  type CoverImageConversionJobData,
} from "../../src/handlers/image-conversion-handler";
import { createSilentLogger } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import { TINY_PNG_DATA_URL as VALID_PNG_DATA_URL } from "../fixtures";

describe("CoverImageConversionJobHandler", () => {
  let handler: CoverImageConversionJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;
  let mockFetcher: ReturnType<typeof mock>;
  let dir: string;
  let postPath: string;

  /** The post on disk the handler reads and rewrites. */
  const givenPost = (markdown: string): void => {
    writeFileSync(postPath, markdown);
  };
  const savedPost = (): string => readFileSync(postPath, "utf-8");

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = CallbackProgressReporter.from(async (notification) => {
      const entry: { progress: number; message?: string } = {
        progress: notification.progress,
      };
      if (notification.message !== undefined) {
        entry.message = notification.message;
      }
      progressCalls.push(entry);
    });
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
            entityId: "test-post-cover",
            jobId: "mock-job-id",
            skipped: false,
          },
        },
      },
    });

    mockFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));

    handler = new CoverImageConversionJobHandler(context, logger, mockFetcher);
    progressReporter = createProgressReporter();

    dir = mkdtempSync(join(tmpdir(), "cover-image-conversion-"));
    postPath = join(dir, "post.md");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = {
        filePath: "/path/to/post.md",
        sourceUrl: "https://example.com/image.jpg",
        postTitle: "Test Post",
        postSlug: "test-post",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.filePath).toBe("/path/to/post.md");
      expect(result?.sourceUrl).toBe("https://example.com/image.jpg");
      expect(result?.postTitle).toBe("Test Post");
      expect(result?.postSlug).toBe("test-post");
    });

    it("should validate job data with optional customAlt", () => {
      const validData = {
        filePath: "/path/to/post.md",
        sourceUrl: "https://example.com/image.jpg",
        postTitle: "Test Post",
        postSlug: "test-post",
        customAlt: "Custom alt text for the image",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.customAlt).toBe("Custom alt text for the image");
    });

    it("should reject missing filePath", () => {
      const invalidData = {
        sourceUrl: "https://example.com/image.jpg",
        postTitle: "Test Post",
        postSlug: "test-post",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject missing sourceUrl", () => {
      const invalidData = {
        filePath: "/path/to/post.md",
        postTitle: "Test Post",
        postSlug: "test-post",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject invalid sourceUrl (not a URL)", () => {
      const invalidData = {
        filePath: "/path/to/post.md",
        sourceUrl: "not-a-url",
        postTitle: "Test Post",
        postSlug: "test-post",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject missing postTitle", () => {
      const invalidData = {
        filePath: "/path/to/post.md",
        sourceUrl: "https://example.com/image.jpg",
        postSlug: "test-post",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject missing postSlug", () => {
      const invalidData = {
        filePath: "/path/to/post.md",
        sourceUrl: "https://example.com/image.jpg",
        postTitle: "Test Post",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    const createValidJobData = (
      overrides: Partial<CoverImageConversionJobData> = {},
    ): CoverImageConversionJobData => ({
      filePath: postPath,
      sourceUrl: "https://example.com/image.jpg",
      postTitle: "Test Post",
      postSlug: "test-post",
      ...overrides,
    });

    const markdownWithCoverImageUrl = `---
title: Test Post
slug: test-post
coverImageUrl: https://example.com/image.jpg
---
Some content here.
`;

    const markdownAlreadyConverted = `---
title: Test Post
slug: test-post
coverImageId: test-post-cover
---
Some content here.
`;

    it("should convert coverImageUrl to coverImageId", async () => {
      givenPost(markdownWithCoverImageUrl);

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("test-post-cover");

      // The post on disk now carries the image reference
      const writtenContent = savedPost();
      expect(writtenContent).toContain("coverImageId: test-post-cover");
      expect(writtenContent).not.toContain("coverImageUrl:");
    });

    it("should use customAlt when provided", async () => {
      givenPost(markdownWithCoverImageUrl);

      const jobData = createValidJobData({ customAlt: "My custom alt text" });
      await handler.process(jobData, "job-123", progressReporter);

      // Verify createEntity was called with custom alt
      expect(context.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          metadata: expect.objectContaining({
            alt: "My custom alt text",
          }),
        }),
      });
    });

    it("should use title-based alt when customAlt not provided", async () => {
      givenPost(markdownWithCoverImageUrl);

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      // Verify createEntity was called with title-based alt
      expect(context.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          metadata: expect.objectContaining({
            alt: "Cover image for Test Post",
          }),
        }),
      });
    });

    it("should skip if file already has coverImageId", async () => {
      givenPost(markdownAlreadyConverted);

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockFetcher).not.toHaveBeenCalled();
      expect(savedPost()).toBe(markdownAlreadyConverted);
    });

    it("should reuse existing image entity with same sourceUrl", async () => {
      givenPost(markdownWithCoverImageUrl);

      // Mock listEntities to return existing image
      spyOn(context.entityService, "listEntities").mockResolvedValue([
        createTestEntity("image", { id: "existing-image-id" }),
      ]);

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("existing-image-id");
      expect(mockFetcher).not.toHaveBeenCalled();
      expect(context.entityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle fetch failure gracefully", async () => {
      givenPost(markdownWithCoverImageUrl);
      mockFetcher.mockRejectedValue(new Error("Network error"));

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
      expect(savedPost()).toBe(markdownWithCoverImageUrl);
    });

    it("should handle file read failure gracefully", async () => {
      const jobData = createValidJobData({
        filePath: join(dir, "missing.md"),
      });
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("no such file or directory");
    });

    it("should report progress during conversion", async () => {
      givenPost(markdownWithCoverImageUrl);

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it("should create image entity with correct metadata", async () => {
      givenPost(markdownWithCoverImageUrl);

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      expect(context.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "test-post-cover",
          entityType: "image",
          content: VALID_PNG_DATA_URL,
          metadata: expect.objectContaining({
            title: "Cover image for Test Post",
            alt: "Cover image for Test Post",
            format: "png",
            width: 1,
            height: 1,
            sourceUrl: "https://example.com/image.jpg",
          }),
        }),
      });
    });

    it("should remove coverImageAlt from frontmatter after conversion", async () => {
      const markdownWithAlt = `---
title: Test Post
slug: test-post
coverImageUrl: https://example.com/image.jpg
coverImageAlt: Custom alt
---
Some content here.
`;
      givenPost(markdownWithAlt);

      const jobData = createValidJobData({ customAlt: "Custom alt" });
      await handler.process(jobData, "job-123", progressReporter);

      expect(savedPost()).not.toContain("coverImageAlt:");
    });
  });
});
