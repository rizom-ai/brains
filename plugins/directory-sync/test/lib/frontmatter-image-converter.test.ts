import { describe, test, expect, mock, beforeEach } from "bun:test";
import { FrontmatterImageConverter } from "../../src/lib/frontmatter-image-converter";
import type { IEntityService } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";

// Valid 1x1 PNG with proper headers for dimension detection
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("FrontmatterImageConverter", () => {
  let converter: FrontmatterImageConverter;
  let mockEntityService: IEntityService;
  let mockFetcher: ReturnType<typeof mock>;
  const logger = createSilentLogger();

  beforeEach(() => {
    mockFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));

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
coverImageUrl: https://example.com/image.png
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(true);
      expect(result.content).toContain("coverImageId:");
      expect(result.content).not.toContain("coverImageUrl:");
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
coverImageUrl: local-image.png
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
      const localFetcher = mock(() => Promise.resolve(VALID_PNG_DATA_URL));
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
coverImageUrl: https://example.com/image.png
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
coverImageUrl: https://example.com/image.png
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
coverImageUrl: https://example.com/image.png
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

    test("should generate image ID from post slug", async () => {
      const content = `---
title: My Awesome Post
slug: my-awesome-post
coverImageUrl: https://example.com/path/to/image.png
---

Post content here.`;

      await converter.convert(content);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my-awesome-post-cover",
          entityType: "image",
        }),
      );
    });

    test("should use post title for image title and alt", async () => {
      const content = `---
title: My Awesome Post
slug: my-awesome-post
coverImageUrl: https://example.com/image.png
---

Post content here.`;

      await converter.convert(content);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: "Cover image for My Awesome Post",
            alt: "Cover image for My Awesome Post",
            sourceUrl: "https://example.com/image.png",
          }),
        }),
      );
    });

    test("should use coverImageAlt when provided", async () => {
      const content = `---
title: My Awesome Post
slug: my-awesome-post
coverImageUrl: https://example.com/image.png
coverImageAlt: A beautiful sunset over the mountains
---

Post content here.`;

      await converter.convert(content);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: "Cover image for My Awesome Post",
            alt: "A beautiful sunset over the mountains",
          }),
        }),
      );
    });

    test("should remove coverImageAlt from frontmatter after conversion", async () => {
      const content = `---
title: My Awesome Post
slug: my-awesome-post
coverImageUrl: https://example.com/image.png
coverImageAlt: Custom alt text
---

Post content here.`;

      const result = await converter.convert(content);

      expect(result.converted).toBe(true);
      expect(result.content).not.toContain("coverImageAlt:");
      expect(result.content).not.toContain("coverImageUrl:");
      expect(result.content).toContain("coverImageId:");
    });
  });
});
