import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ImageExtractor } from "../../src/lib/image-extractor";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SAMPLE_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//";

describe("ImageExtractor", () => {
  const logger = createSilentLogger();
  let testOutputDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testOutputDir = join(tmpdir(), `image-extractor-test-${Date.now()}`);
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("detectImageReferences", () => {
    test("should detect entity://image references in content", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `Some markdown with ![Alt](entity://image/my-photo) inline.`;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toBe("my-photo");
    });

    test("should detect multiple references", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `
![First](entity://image/first-id)
![Second](entity://image/second-id)
![Third](entity://image/third-id)
      `;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(3);
      expect(refs).toContain("first-id");
      expect(refs).toContain("second-id");
      expect(refs).toContain("third-id");
    });

    test("should return unique IDs only", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `
![First use](entity://image/same-id)
![Second use](entity://image/same-id)
![Different](entity://image/other-id)
      `;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs).toContain("same-id");
      expect(refs).toContain("other-id");
    });

    test("should return empty array if no references", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `Just plain text with ![regular](https://example.com/img.png)`;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(0);
    });

    test("should detect entity://image in HTML img src attributes", () => {
      // REGRESSION TEST: HTML img tags should be detected, not just markdown
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `<article><img src="entity://image/cover-image" alt="Cover"/></article>`;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toBe("cover-image");
    });

    test("should detect entity://image in HTML img with single quotes", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `<img src='entity://image/single-quote-id' alt='Test'/>`;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toBe("single-quote-id");
    });

    test("should detect both markdown and HTML image references", () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const content = `
        <img src="entity://image/html-image"/>
        ![Markdown](entity://image/markdown-image)
      `;

      const refs = extractor.detectImageReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs).toContain("html-image");
      expect(refs).toContain("markdown-image");
    });
  });

  describe("extractFromContent", () => {
    test("should extract image to file and return imageMap", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "test-image",
            entityType: "image",
            content: SAMPLE_PNG_DATA_URL,
            metadata: { title: "Test", format: "png" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc123",
          },
        },
      });
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [`![Test](entity://image/test-image)`];

      const imageMap = await extractor.extractFromContent(contents);

      // Should return map with static URL
      expect(imageMap["test-image"]).toBe("/images/test-image.png");

      // Should have written file to disk
      const filePath = join(testOutputDir, "images", "test-image.png");
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    test("should handle multiple images from multiple content strings", async () => {
      let callCount = 0;
      const getEntityImpl = mock((_type: string, id: string) => {
        callCount++;
        const format = callCount === 1 ? "png" : "jpeg";
        const dataUrl =
          callCount === 1 ? SAMPLE_PNG_DATA_URL : SAMPLE_JPEG_DATA_URL;
        return Promise.resolve({
          id,
          entityType: "image",
          content: dataUrl,
          metadata: { title: `Image ${callCount}`, format },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: `hash-${callCount}`,
        });
      });

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [
        `Post 1: ![Photo](entity://image/photo-1)`,
        `Post 2: ![Banner](entity://image/banner-2)`,
      ];

      const imageMap = await extractor.extractFromContent(contents);

      expect(Object.keys(imageMap)).toHaveLength(2);
      expect(imageMap["photo-1"]).toBe("/images/photo-1.png");
      expect(imageMap["banner-2"]).toBe("/images/banner-2.jpeg");
    });

    test("should skip missing images gracefully", async () => {
      let callCount = 0;
      const getEntityImpl = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(null); // First one missing
        }
        return Promise.resolve({
          id: "exists",
          entityType: "image",
          content: SAMPLE_PNG_DATA_URL,
          metadata: { format: "png" },
        });
      });

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [
        `![Missing](entity://image/missing-id) and ![Exists](entity://image/exists-id)`,
      ];

      const imageMap = await extractor.extractFromContent(contents);

      // Only the existing image should be in the map
      expect(Object.keys(imageMap)).toHaveLength(1);
      expect(imageMap["exists-id"]).toBe("/images/exists-id.png");
      expect(imageMap["missing-id"]).toBeUndefined();
    });

    test("should handle entity service errors gracefully", async () => {
      const getEntityImpl = mock(() =>
        Promise.reject(new Error("Database error")),
      );

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [`![Image](entity://image/some-id)`];

      const imageMap = await extractor.extractFromContent(contents);

      expect(Object.keys(imageMap)).toHaveLength(0);
    });

    test("should return empty map for content without images", async () => {
      const mockEntityService = createMockEntityService();
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [`Just plain text, no images here.`];

      const imageMap = await extractor.extractFromContent(contents);

      expect(Object.keys(imageMap)).toHaveLength(0);
    });

    test("should create images directory if it doesn't exist", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "test",
            entityType: "image",
            content: SAMPLE_PNG_DATA_URL,
            metadata: {
              title: "Test",
              alt: "Test image",
              format: "png",
              width: 100,
              height: 100,
            },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "hash",
          },
        },
      });
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [`![Test](entity://image/test)`];

      await extractor.extractFromContent(contents);

      const imagesDir = join(testOutputDir, "images");
      const dirExists = await fs
        .access(imagesDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    test("should deduplicate same image across multiple content strings", async () => {
      const getEntityImpl = mock(() =>
        Promise.resolve({
          id: "shared",
          entityType: "image",
          content: SAMPLE_PNG_DATA_URL,
          metadata: { format: "png" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "hash",
        }),
      );

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const contents = [
        `Post 1: ![Shared](entity://image/shared-image)`,
        `Post 2: ![Same](entity://image/shared-image)`,
        `Post 3: ![Again](entity://image/shared-image)`,
      ];

      const imageMap = await extractor.extractFromContent(contents);

      // Should only fetch once
      expect(getEntityImpl).toHaveBeenCalledTimes(1);
      expect(Object.keys(imageMap)).toHaveLength(1);
    });
  });

  describe("file format detection", () => {
    test("should extract PNG with .png extension", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "png-image",
            entityType: "image",
            content: SAMPLE_PNG_DATA_URL,
            metadata: { format: "png" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "hash",
          },
        },
      });
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const imageMap = await extractor.extractFromContent([
        `![PNG](entity://image/png-image)`,
      ]);

      expect(imageMap["png-image"]).toBe("/images/png-image.png");
    });

    test("should extract JPEG with .jpeg extension", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "jpeg-image",
            entityType: "image",
            content: SAMPLE_JPEG_DATA_URL,
            metadata: { format: "jpeg" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "hash",
          },
        },
      });
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const imageMap = await extractor.extractFromContent([
        `![JPEG](entity://image/jpeg-image)`,
      ]);

      expect(imageMap["jpeg-image"]).toBe("/images/jpeg-image.jpeg");
    });

    test("should fall back to detecting format from data URL", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "no-format",
            entityType: "image",
            content: SAMPLE_PNG_DATA_URL,
            metadata: {}, // No format in metadata
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "hash",
          },
        },
      });
      const extractor = new ImageExtractor(
        testOutputDir,
        mockEntityService,
        logger,
      );

      const imageMap = await extractor.extractFromContent([
        `![No format](entity://image/no-format)`,
      ]);

      expect(imageMap["no-format"]).toBe("/images/no-format.png");
    });
  });
});
