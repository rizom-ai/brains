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
import {
  CoverImageConversionJobHandler,
  type CoverImageConversionJobData,
} from "../../src/handlers/image-conversion-handler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";

// Valid 1x1 PNG image as base64 data URL
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("CoverImageConversionJobHandler", () => {
  let handler: CoverImageConversionJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;
  let mockFetcher: ReturnType<typeof mock>;
  let readFileSyncSpy: ReturnType<typeof spyOn>;
  let writeFileSyncSpy: ReturnType<typeof spyOn>;

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = ProgressReporter.from(async (notification) => {
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
          createEntity: { entityId: "test-post-cover" },
        },
      },
    });

    mockFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));

    handler = new CoverImageConversionJobHandler(context, logger, mockFetcher);
    progressReporter = createProgressReporter();

    // Mock file system operations - reset any previous spies first
    readFileSyncSpy = spyOn(fs, "readFileSync");
    writeFileSyncSpy = spyOn(fs, "writeFileSync");
  });

  afterEach(() => {
    // Restore original implementations
    readFileSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
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
      filePath: "/path/to/post.md",
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
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("test-post-cover");

      // Verify file was written with updated frontmatter
      expect(writeFileSyncSpy).toHaveBeenCalled();
      const writtenContent = writeFileSyncSpy.mock.calls[0]?.[1] as string;
      expect(writtenContent).toContain("coverImageId: test-post-cover");
      expect(writtenContent).not.toContain("coverImageUrl:");
    });

    it("should use customAlt when provided", async () => {
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData({ customAlt: "My custom alt text" });
      await handler.process(jobData, "job-123", progressReporter);

      // Verify createEntity was called with custom alt
      expect(context.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            alt: "My custom alt text",
          }),
        }),
      );
    });

    it("should use title-based alt when customAlt not provided", async () => {
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      // Verify createEntity was called with title-based alt
      expect(context.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            alt: "Cover image for Test Post",
          }),
        }),
      );
    });

    it("should skip if file already has coverImageId", async () => {
      readFileSyncSpy.mockReturnValue(markdownAlreadyConverted);

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockFetcher).not.toHaveBeenCalled();
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it("should reuse existing image entity with same sourceUrl", async () => {
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      // Mock listEntities to return existing image
      (
        context.entityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue([{ id: "existing-image-id" }]);

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
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      mockFetcher.mockRejectedValue(new Error("Network error"));

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it("should handle file read failure gracefully", async () => {
      readFileSyncSpy.mockImplementation(() => {
        throw new Error("File not found");
      });

      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should report progress during conversion", async () => {
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it("should create image entity with correct metadata", async () => {
      readFileSyncSpy.mockReturnValue(markdownWithCoverImageUrl);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      expect(context.entityService.createEntity).toHaveBeenCalledWith({
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
      readFileSyncSpy.mockReturnValue(markdownWithAlt);
      writeFileSyncSpy.mockImplementation(() => {});

      const jobData = createValidJobData({ customAlt: "Custom alt" });
      await handler.process(jobData, "job-123", progressReporter);

      const writtenContent = writeFileSyncSpy.mock.calls[0]?.[1] as string;
      expect(writtenContent).not.toContain("coverImageAlt:");
    });
  });
});
