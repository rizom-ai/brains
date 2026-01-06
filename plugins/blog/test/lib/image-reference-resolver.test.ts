import { describe, test, expect, mock } from "bun:test";
import { ImageReferenceResolver } from "../../src/lib/image-reference-resolver";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

const SAMPLE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("ImageReferenceResolver", () => {
  const logger = createSilentLogger();

  describe("detectReferences", () => {
    const mockEntityService = createMockEntityService();
    const resolver = new ImageReferenceResolver(mockEntityService, logger);

    test("should detect single entity reference", () => {
      const content = `Some text with an image:

![Alt text](entity://image/my-image-id)

More text.`;

      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        imageId: "my-image-id",
        alt: "Alt text",
        originalMarkdown: "![Alt text](entity://image/my-image-id)",
      });
    });

    test("should detect multiple entity references", () => {
      const content = `First image: ![First](entity://image/first-id)

Second image: ![Second](entity://image/second-id)

Third: ![](entity://image/third-id)`;

      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(3);
      expect(refs[0]?.imageId).toBe("first-id");
      expect(refs[1]?.imageId).toBe("second-id");
      expect(refs[2]?.imageId).toBe("third-id");
    });

    test("should return empty array if no references", () => {
      const content = `Just plain text with a regular image:

![Alt](https://example.com/image.png)`;

      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(0);
    });

    test("should handle empty alt text", () => {
      const content = `![](entity://image/no-alt-image)`;

      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.alt).toBe("");
    });

    test("should extract image IDs with various characters", () => {
      const content = `![Image](entity://image/my-post-inline-0)

![Another](entity://image/some_image_123)`;

      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs[0]?.imageId).toBe("my-post-inline-0");
      expect(refs[1]?.imageId).toBe("some_image_123");
    });
  });

  describe("resolve", () => {
    test("should replace entity reference with data URL", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "test-image",
            entityType: "image",
            content: SAMPLE_DATA_URL,
            metadata: { title: "Test Image" },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc123",
          },
        },
      });
      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `Text before

![Alt text](entity://image/test-image)

Text after`;

      const result = await resolver.resolve(content);

      expect(result.content).toContain(SAMPLE_DATA_URL);
      expect(result.content).not.toContain("entity://image/test-image");
      expect(result.resolvedCount).toBe(1);
    });

    test("should preserve alt text in resolved image", async () => {
      const mockEntityService = createMockEntityService({
        returns: {
          getEntity: {
            id: "sunset-id",
            entityType: "image",
            content: SAMPLE_DATA_URL,
            metadata: {},
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            contentHash: "abc123",
          },
        },
      });
      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![Beautiful sunset](entity://image/sunset-id)`;

      const result = await resolver.resolve(content);

      expect(result.content).toContain("![Beautiful sunset](");
    });

    test("should resolve multiple references", async () => {
      // Use a custom implementation that returns different images
      let callCount = 0;
      const getEntityImpl = mock(() => {
        callCount++;
        return Promise.resolve({
          id: `image-${callCount}`,
          entityType: "image",
          content: `data:image/png;base64,image${callCount}`,
          metadata: { title: `Image ${callCount}` },
        });
      });

      const mockEntityService = createMockEntityService();
      // Override getEntity with our tracking mock
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![First](entity://image/first)

![Second](entity://image/second)`;

      const result = await resolver.resolve(content);

      expect(result.resolvedCount).toBe(2);
      expect(result.content).toContain("data:image/png;base64,image1");
      expect(result.content).toContain("data:image/png;base64,image2");
    });

    test("should handle missing image gracefully", async () => {
      const mockEntityService = createMockEntityService({
        returns: { getEntity: null },
      });
      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![Missing](entity://image/missing-id)

Some other text.`;

      const result = await resolver.resolve(content);

      // Should keep original reference when image not found
      expect(result.content).toContain("entity://image/missing-id");
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    test("should continue resolving after one failure", async () => {
      let callCount = 0;
      const getEntityImpl = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(null); // First one fails
        }
        return Promise.resolve({
          id: "success",
          entityType: "image",
          content: SAMPLE_DATA_URL,
          metadata: {},
        });
      });

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![Missing](entity://image/missing)

![Present](entity://image/present)`;

      const result = await resolver.resolve(content);

      expect(result.resolvedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.content).toContain("entity://image/missing");
      expect(result.content).toContain(SAMPLE_DATA_URL);
    });

    test("should return unchanged content if no references", async () => {
      const mockEntityService = createMockEntityService();
      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `Just plain markdown without entity references.

![Regular](https://example.com/image.png)`;

      const result = await resolver.resolve(content);

      expect(result.content).toBe(content);
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(0);
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

      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![Image](entity://image/some-id)`;

      const result = await resolver.resolve(content);

      expect(result.content).toContain("entity://image/some-id");
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    test("should batch fetch images efficiently", async () => {
      const getEntityImpl = mock(() =>
        Promise.resolve({
          id: "test",
          entityType: "image",
          content: SAMPLE_DATA_URL,
          metadata: {},
        }),
      );

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![A](entity://image/img-a)
![B](entity://image/img-b)
![C](entity://image/img-c)`;

      await resolver.resolve(content);

      // Should call getEntity once per unique image
      expect(getEntityImpl).toHaveBeenCalledTimes(3);
    });

    test("should deduplicate same image ID", async () => {
      const getEntityImpl = mock(() =>
        Promise.resolve({
          id: "same-id",
          entityType: "image",
          content: SAMPLE_DATA_URL,
          metadata: {},
        }),
      );

      const mockEntityService = createMockEntityService();
      Object.defineProperty(mockEntityService, "getEntity", {
        value: getEntityImpl,
        writable: true,
      });

      const resolver = new ImageReferenceResolver(mockEntityService, logger);

      const content = `![First use](entity://image/same-id)

Later: ![Second use](entity://image/same-id)`;

      const result = await resolver.resolve(content);

      // Same ID referenced twice, but only fetched once
      expect(getEntityImpl).toHaveBeenCalledTimes(1);
      expect(result.resolvedCount).toBe(2);
    });
  });
});
