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

// Valid 1x1 PNG bytes for mock fetch responses
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_PNG_BUFFER = Buffer.from(VALID_PNG_BASE64, "base64");

describe("DirectorySync - FrontmatterImageConverter Integration", () => {
  let tempDir: string;
  let mockEntityService: IEntityService;
  let directorySync: DirectorySync;
  const logger = createSilentLogger();

  beforeEach(() => {
    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "directory-sync-image-test-"));

    // Create mock entity service - listEntities returns [] by default
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
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should convert coverImage URL to coverImageId during import", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post file with coverImage URL
    const postPath = join(postDir, "test-post.md");
    const originalContent = `---
title: Test Post
coverImageUrl: https://example.com/hero.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Mock fetch for image download with valid PNG data
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Map([["content-type", "image/png"]]),
        arrayBuffer: () => Promise.resolve(VALID_PNG_BUFFER.buffer),
      } as unknown as Response),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    // Import entities
    const result = await directorySync.importEntities();

    // Verify the file was rewritten with coverImageId
    const updatedContent = readFileSync(postPath, "utf-8");
    expect(updatedContent).toContain("coverImageId:");
    expect(updatedContent).not.toContain("coverImageUrl: https://");

    // Verify image entity was created
    expect(mockEntityService.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "image",
      }),
    );

    // Verify post was imported
    expect(result.imported).toBe(1);
  });

  test("should skip conversion if coverImageId already exists", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post file that already has coverImageId
    const postPath = join(postDir, "converted-post.md");
    const content = `---
title: Already Converted Post
coverImageId: existing-image-id
---

Post content here.`;

    writeFileSync(postPath, content);

    // Import entities
    const result = await directorySync.importEntities();

    // Verify the file was NOT modified
    const fileContent = readFileSync(postPath, "utf-8");
    expect(fileContent).toBe(content);

    // Verify no image was created
    expect(mockEntityService.createEntity).not.toHaveBeenCalled();

    // Verify post was imported
    expect(result.imported).toBe(1);
  });

  test("should skip conversion for non-HTTP coverImage values", async () => {
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

    // Verify the file was NOT modified
    const fileContent = readFileSync(postPath, "utf-8");
    expect(fileContent).toBe(content);

    // Verify no image was created
    expect(mockEntityService.createEntity).not.toHaveBeenCalled();

    expect(result.imported).toBe(1);
  });

  test("should reuse existing image entity with same sourceUrl", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with coverImage URL
    const postPath = join(postDir, "reuse-image-post.md");
    const originalContent = `---
title: Reuse Image Post
coverImageUrl: https://example.com/existing.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Create a new mock entity service that returns existing image
    const mockEntityServiceWithImage = createMockEntityService({
      entityTypes: ["post", "image"],
      returns: {
        listEntities: [
          {
            id: "existing-image-id",
            entityType: "image",
            content: "data:image/jpeg;base64,xxx",
            metadata: { sourceUrl: "https://example.com/existing.jpg" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "mock-hash",
          },
        ],
      },
    });

    // Mock upsertEntity for post creation
    mockEntityServiceWithImage.upsertEntity = mock(() =>
      Promise.resolve({
        entityId: "test-post-id",
        jobId: "job-2",
        created: false,
      }),
    );

    // Mock deserializeEntity
    mockEntityServiceWithImage.deserializeEntity = mock((content: string) => {
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

      return {
        metadata,
        content,
      };
    });

    // Create new DirectorySync with this service
    const directorySyncWithImage = new DirectorySync({
      syncPath: tempDir,
      entityService: mockEntityServiceWithImage,
      logger,
      autoSync: false,
    });

    // Import entities
    const result = await directorySyncWithImage.importEntities();

    // Verify the file was rewritten with existing image ID
    const updatedContent = readFileSync(postPath, "utf-8");
    expect(updatedContent).toContain("coverImageId: existing-image-id");

    // Verify NO new image was created (reused existing)
    expect(mockEntityServiceWithImage.createEntity).not.toHaveBeenCalled();

    expect(result.imported).toBe(1);
  });

  test("should handle fetch errors gracefully", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with coverImage URL
    const postPath = join(postDir, "fetch-error-post.md");
    const originalContent = `---
title: Fetch Error Post
coverImageUrl: https://example.com/broken.jpg
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Mock fetch to fail
    global.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    ) as unknown as typeof fetch;

    // Import entities
    const result = await directorySync.importEntities();

    // Verify the file was NOT modified (graceful failure)
    const fileContent = readFileSync(postPath, "utf-8");
    expect(fileContent).toBe(originalContent);

    // Post should still be imported with original content
    expect(result.imported).toBe(1);
  });

  test("should preserve other frontmatter fields during conversion", async () => {
    // Create post directory
    const postDir = join(tempDir, "post");
    mkdirSync(postDir, { recursive: true });

    // Write a post with many frontmatter fields
    const postPath = join(postDir, "preserve-fields-post.md");
    const originalContent = `---
title: Preserve Fields Post
author: John Doe
coverImageUrl: https://example.com/hero.jpg
tags:
  - test
  - demo
status: draft
---

Post content here.`;

    writeFileSync(postPath, originalContent);

    // Mock fetch for image download with valid PNG data
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        headers: new Map([["content-type", "image/png"]]),
        arrayBuffer: () => Promise.resolve(VALID_PNG_BUFFER.buffer),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    // Import entities
    await directorySync.importEntities();

    // Verify the file preserves other fields
    const updatedContent = readFileSync(postPath, "utf-8");
    expect(updatedContent).toContain("title: Preserve Fields Post");
    expect(updatedContent).toContain("author: John Doe");
    expect(updatedContent).toContain("coverImageId:");
    expect(updatedContent).toContain("tags:");
    expect(updatedContent).toContain("status: draft");
    expect(updatedContent).not.toContain("coverImageUrl: https://");
  });
});
