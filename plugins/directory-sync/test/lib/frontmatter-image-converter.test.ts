import { describe, test, expect, mock, beforeEach } from "bun:test";
import { FrontmatterImageConverter } from "../../src/lib/frontmatter-image-converter";
import type { IEntityService } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";

describe("FrontmatterImageConverter", () => {
  let converter: FrontmatterImageConverter;
  let mockEntityService: IEntityService;
  let mockFetcher: ReturnType<typeof mock>;
  const logger = createSilentLogger();

  beforeEach(() => {
    mockFetcher = mock(() =>
      Promise.resolve("data:image/png;base64,iVBORw0KGgo="),
    );

    mockEntityService = {
      listEntities: mock(() => Promise.resolve([])),
      createEntity: mock(() =>
        Promise.resolve({ entityId: "generated-image-id", jobId: "job-1" }),
      ),
    } as unknown as IEntityService;

    converter = new FrontmatterImageConverter(
      mockEntityService,
      logger,
      mockFetcher,
    );
  });

  describe("convert", () => {
    test("should convert coverImage URL to coverImageId", async () => {
      const content = `---
title: Test Post
coverImage: https://example.com/image.png
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(true);
      expect(result.content).toContain("coverImageId:");
      expect(result.content).not.toContain("coverImage:");
      expect(mockFetcher).toHaveBeenCalledWith("https://example.com/image.png");
    });

    test("should skip if coverImageId already exists", async () => {
      const content = `---
title: Test Post
coverImageId: existing-image-id
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(false);
      expect(result.content).toBe(content);
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    test("should skip if coverImage is not an HTTP URL", async () => {
      const content = `---
title: Test Post
coverImage: local-image.png
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(false);
      expect(result.content).toBe(content);
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    test("should skip if no coverImage field", async () => {
      const content = `---
title: Test Post
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(false);
      expect(result.content).toBe(content);
    });

    test("should reuse existing image entity with same sourceUrl", async () => {
      // Create everything fresh for this test
      const localFetcher = mock(() =>
        Promise.resolve("data:image/png;base64,xxx"),
      );
      const localLogger = createSilentLogger();

      const entityServiceWithExisting = {
        listEntities: mock(() =>
          Promise.resolve([
            {
              id: "existing-image-id",
              metadata: { sourceUrl: "https://example.com/image.png" },
            },
          ]),
        ),
        createEntity: mock(() =>
          Promise.resolve({ entityId: "new-id", jobId: "job-1" }),
        ),
      } as unknown as IEntityService;

      const converterWithExisting = new FrontmatterImageConverter(
        entityServiceWithExisting,
        localLogger,
        localFetcher,
      );

      const content = `---
title: Test Post
coverImage: https://example.com/image.png
---

Post content here.`;

      const result = await converterWithExisting.convert(content);

      expect(result.converted).toBe(true);
      expect(result.imageId).toBe("existing-image-id");
      expect(localFetcher).not.toHaveBeenCalled();
      expect(entityServiceWithExisting.createEntity).not.toHaveBeenCalled();
    });

    test("should handle fetch failure gracefully", async () => {
      mockFetcher.mockRejectedValueOnce(new Error("Network error"));

      const content = `---
title: Test Post
coverImage: https://example.com/image.png
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(false);
      expect(result.content).toBe(content);
    });

    test("should preserve other frontmatter fields", async () => {
      const content = `---
title: Test Post
author: John Doe
coverImage: https://example.com/image.png
tags:
  - test
  - demo
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(true);
      expect(result.content).toContain("title: Test Post");
      expect(result.content).toContain("author: John Doe");
      expect(result.content).toContain("tags:");
    });

    test("should generate image ID from URL filename", async () => {
      const content = `---
title: Test Post
coverImage: https://example.com/path/to/my-awesome-image.png
---

Post content here.`;

      await converter.convert(content);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my-awesome-image",
          entityType: "image",
        }),
      );
    });

    test("should store sourceUrl in image metadata for deduplication", async () => {
      const content = `---
title: Test Post
coverImage: https://example.com/image.png
---

Post content here.`;

      await converter.convert(content);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sourceUrl: "https://example.com/image.png",
          }),
        }),
      );
    });
  });
});
