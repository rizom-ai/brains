import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../../src/lib/directory-sync";
import type { IEntityService } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { JobRequest } from "../../src/types";

describe("DirectorySync - Non-blocking Image Conversion", () => {
  let tempDir: string;
  let mockEntityService: IEntityService;
  let directorySync: DirectorySync;
  let queuedJobs: JobRequest[];
  let mockJobQueueCallback: ReturnType<typeof mock>;
  const logger = createSilentLogger();

  beforeEach(() => {
    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "directory-sync-image-test-"));

    // Track queued jobs
    queuedJobs = [];
    mockJobQueueCallback = mock((job: JobRequest) => {
      queuedJobs.push(job);
      return Promise.resolve("mock-job-id");
    });

    // Create mock entity service
    mockEntityService = createMockEntityService({
      entityTypes: ["post", "image"],
      returns: {
        createEntity: { entityId: "test-image-id", jobId: "job-1" },
      },
    });

    // Mock upsertEntity for post creation
    mockEntityService.upsertEntity = mock(() =>
      Promise.resolve({
        entityId: "test-post-id",
        jobId: "job-2",
        created: false,
      }),
    );

    // Mock deserializeEntity to parse frontmatter
    mockEntityService.deserializeEntity = mock((content: string) => {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const metadata: Record<string, unknown> = {};

      if (frontmatterMatch?.[1]) {
        const frontmatterLines = frontmatterMatch[1].split("\n");
        for (const line of frontmatterLines) {
          const [key, ...valueParts] = line.split(": ");
          if (key && valueParts.length > 0) {
            metadata[key.trim()] = valueParts.join(": ").trim();
          }
        }
      }

      return { metadata, content };
    });

    directorySync = new DirectorySync({
      syncPath: tempDir,
      entityService: mockEntityService,
      logger,
      autoSync: false,
    });

    // Set up job queue callback
    directorySync.setJobQueueCallback(mockJobQueueCallback);
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should queue image conversion job for coverImageUrl", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post file with coverImage URL
    const postPath = join(postDir, "test-post.md");
    const originalContent = `---
title: Test Post
slug: test-post
coverImageUrl: https://example.com/hero.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Import entities
    const result = await directorySync.importEntities();

    // Verify a job was queued
    expect(queuedJobs.length).toBe(1);
    expect(queuedJobs[0]?.type).toBe("cover-image-convert");
    expect(queuedJobs[0]?.data).toEqual({
      filePath: postPath,
      sourceUrl: "https://example.com/hero.jpg",
      postTitle: "Test Post",
      postSlug: "test-post",
      customAlt: undefined,
    });

    // Verify file was NOT modified (non-blocking)
    const fileContent = readFileSync(postPath, "utf-8");
    expect(fileContent).toBe(originalContent);

    // Verify post was still imported
    expect(result.imported).toBe(1);
  });

  test("should include customAlt in queued job", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with coverImageAlt
    const postPath = join(postDir, "alt-post.md");
    const originalContent = `---
title: Alt Post
slug: alt-post
coverImageUrl: https://example.com/hero.jpg
coverImageAlt: Custom description
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Import entities
    await directorySync.importEntities();

    // Verify job includes customAlt
    expect(queuedJobs.length).toBe(1);
    expect(queuedJobs[0]?.data).toEqual(
      expect.objectContaining({
        customAlt: "Custom description",
      }),
    );
  });

  test("should not queue job if coverImageId already exists", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post that already has coverImageId
    const postPath = join(postDir, "converted-post.md");
    const content = `---
title: Already Converted Post
coverImageId: existing-image-id
---

Post content here.`;

    writeFileSync(postPath, content);

    // Import entities
    const result = await directorySync.importEntities();

    // Verify no job was queued
    expect(queuedJobs.length).toBe(0);

    // Verify post was imported
    expect(result.imported).toBe(1);
  });

  test("should not queue job for non-HTTP coverImage values", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with local image path
    const postPath = join(postDir, "local-image-post.md");
    const content = `---
title: Local Image Post
coverImageUrl: local-hero.jpg
---

Post content here.`;

    writeFileSync(postPath, content);

    // Import entities
    const result = await directorySync.importEntities();

    // Verify no job was queued (not an HTTP URL)
    expect(queuedJobs.length).toBe(0);

    // Verify post was imported
    expect(result.imported).toBe(1);
  });

  test("should not queue job if no job queue callback configured", async () => {
    // Create DirectorySync WITHOUT job queue callback
    const directorySyncNoQueue = new DirectorySync({
      syncPath: tempDir,
      entityService: mockEntityService,
      logger,
      autoSync: false,
    });
    // Note: NOT calling setJobQueueCallback

    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with coverImage URL
    const postPath = join(postDir, "no-queue-post.md");
    const originalContent = `---
title: No Queue Post
slug: no-queue-post
coverImageUrl: https://example.com/hero.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Import entities - should not throw
    const result = await directorySyncNoQueue.importEntities();

    // Verify post was imported (gracefully handled)
    expect(result.imported).toBe(1);
  });

  test("should generate slug from title if not provided", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post without explicit slug
    const postPath = join(postDir, "no-slug-post.md");
    const originalContent = `---
title: My Awesome Post Title
coverImageUrl: https://example.com/hero.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Import entities
    await directorySync.importEntities();

    // Verify job has generated slug
    expect(queuedJobs.length).toBe(1);
    expect(queuedJobs[0]?.data).toEqual(
      expect.objectContaining({
        postSlug: "my-awesome-post-title",
      }),
    );
  });

  test("should handle job queue errors gracefully", async () => {
    // Set up failing job queue
    directorySync.setJobQueueCallback(() =>
      Promise.reject(new Error("Queue error")),
    );

    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with coverImage URL
    const postPath = join(postDir, "queue-error-post.md");
    const originalContent = `---
title: Queue Error Post
slug: queue-error-post
coverImageUrl: https://example.com/hero.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Import entities - should not throw
    const result = await directorySync.importEntities();

    // Verify post was still imported (queue error is non-fatal)
    expect(result.imported).toBe(1);
  });
});
