import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  ContentResolver,
  hasImageReferences,
  shouldResolveContent,
} from "../src/lib/content-resolver";
import { createSilentLogger } from "@brains/test-utils";
import type { ICoreEntityService } from "../src/types";

describe("ContentResolver", () => {
  describe("hasImageReferences", () => {
    it("should return true when content contains entity://image/ reference", () => {
      const content = "Some text ![alt](entity://image/test-id) more text";
      expect(hasImageReferences(content)).toBe(true);
    });

    it("should return false when content has no entity://image/ reference", () => {
      const content =
        "Some text ![alt](https://example.com/image.png) more text";
      expect(hasImageReferences(content)).toBe(false);
    });

    it("should return false for empty content", () => {
      expect(hasImageReferences("")).toBe(false);
    });
  });

  describe("shouldResolveContent", () => {
    it("should return true for post entity type", () => {
      expect(shouldResolveContent("post")).toBe(true);
    });

    it("should return true for note entity type", () => {
      expect(shouldResolveContent("note")).toBe(true);
    });

    it("should return false for image entity type", () => {
      expect(shouldResolveContent("image")).toBe(false);
    });
  });

  describe("ContentResolver.detectReferences", () => {
    let resolver: ContentResolver;

    beforeEach(() => {
      resolver = new ContentResolver(createSilentLogger());
    });

    it("should detect single image reference", () => {
      const content = "![Alt text](entity://image/my-image-id)";
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.imageId).toBe("my-image-id");
      expect(refs[0]?.alt).toBe("Alt text");
      expect(refs[0]?.originalMarkdown).toBe(
        "![Alt text](entity://image/my-image-id)",
      );
    });

    it("should detect multiple image references", () => {
      const content = `
![First](entity://image/first-id)
Some text
![Second](entity://image/second-id)
      `;
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs[0]?.imageId).toBe("first-id");
      expect(refs[1]?.imageId).toBe("second-id");
    });

    it("should handle empty alt text", () => {
      const content = "![](entity://image/no-alt-id)";
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.alt).toBe("");
      expect(refs[0]?.imageId).toBe("no-alt-id");
    });

    it("should handle image IDs with spaces", () => {
      const content = "![Alt](entity://image/My Image Name)";
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.imageId).toBe("My Image Name");
    });

    it("should not detect HTTP URLs", () => {
      const content = "![Alt](https://example.com/image.png)";
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(0);
    });

    it("should return empty array for content without references", () => {
      const content = "Just plain text without any images";
      const refs = resolver.detectReferences(content);

      expect(refs).toHaveLength(0);
    });
  });

  describe("ContentResolver.resolve", () => {
    let resolver: ContentResolver;
    let mockEntityService: ICoreEntityService;

    beforeEach(() => {
      resolver = new ContentResolver(createSilentLogger());
      mockEntityService = {
        getEntity: mock(() => Promise.resolve(null)),
        getEntityRaw: mock(() => Promise.resolve(null)),
        listEntities: mock(() => Promise.resolve([])),
        search: mock(() => Promise.resolve([])),
        getEntityTypes: mock(() => []),
        hasEntityType: mock(() => false),
        countEntities: mock(() => Promise.resolve(0)),
        getEntityCounts: mock(() => Promise.resolve([])),
        getWeightMap: mock(() => ({})),
      };
    });

    it("should return unchanged content when no references found", async () => {
      const content = "Plain text without images";
      const result = await resolver.resolve(content, mockEntityService);

      expect(result.content).toBe(content);
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it("should resolve single image reference to data URL", async () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      mockEntityService.getEntityRaw = mock(() =>
        Promise.resolve({ content: dataUrl } as never),
      );

      const content = "![Alt](entity://image/test-id)";
      const result = await resolver.resolve(content, mockEntityService);

      expect(result.content).toBe(`![Alt](${dataUrl})`);
      expect(result.resolvedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it("should handle multiple references to same image", async () => {
      const dataUrl = "data:image/png;base64,abc123";
      mockEntityService.getEntityRaw = mock(() =>
        Promise.resolve({ content: dataUrl } as never),
      );

      const content =
        "![First](entity://image/same-id) and ![Second](entity://image/same-id)";
      const result = await resolver.resolve(content, mockEntityService);

      expect(result.content).toBe(
        `![First](${dataUrl}) and ![Second](${dataUrl})`,
      );
      expect(result.resolvedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      // Should only fetch once (batch deduplication)
      expect(mockEntityService.getEntityRaw).toHaveBeenCalledTimes(1);
    });

    it("should count failed resolutions when image not found", async () => {
      mockEntityService.getEntityRaw = mock(() => Promise.resolve(null));

      const content = "![Alt](entity://image/missing-id)";
      const result = await resolver.resolve(content, mockEntityService);

      // Content unchanged when resolution fails
      expect(result.content).toBe(content);
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it("should handle mixed success and failure", async () => {
      const dataUrl = "data:image/png;base64,success";
      mockEntityService.getEntityRaw = mock((_type: string, id: string) => {
        if (id === "found-id") {
          return Promise.resolve({ content: dataUrl } as never);
        }
        return Promise.resolve(null);
      });

      const content =
        "![Found](entity://image/found-id) and ![Missing](entity://image/missing-id)";
      const result = await resolver.resolve(content, mockEntityService);

      expect(result.content).toContain(`![Found](${dataUrl})`);
      expect(result.content).toContain("![Missing](entity://image/missing-id)");
      expect(result.resolvedCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    it("should handle entity service errors gracefully", async () => {
      mockEntityService.getEntityRaw = mock(() =>
        Promise.reject(new Error("Database error")),
      );

      const content = "![Alt](entity://image/error-id)";
      const result = await resolver.resolve(content, mockEntityService);

      expect(result.content).toBe(content);
      expect(result.resolvedCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it("should use getEntityRaw to avoid recursion", async () => {
      const dataUrl = "data:image/png;base64,test";
      mockEntityService.getEntityRaw = mock(() =>
        Promise.resolve({ content: dataUrl } as never),
      );

      const content = "![Alt](entity://image/test-id)";
      await resolver.resolve(content, mockEntityService);

      // Should call getEntityRaw, not getEntity
      expect(mockEntityService.getEntityRaw).toHaveBeenCalledWith(
        "image",
        "test-id",
      );
      expect(mockEntityService.getEntity).not.toHaveBeenCalled();
    });
  });
});
