import { describe, test, expect, mock, beforeEach } from "bun:test";
import { MarkdownImageConverter } from "../../src/lib/markdown-image-converter";
import type { IEntityService } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { TINY_PNG_DATA_URL as VALID_PNG_DATA_URL } from "../fixtures";

describe("MarkdownImageConverter", () => {
  let converter: MarkdownImageConverter;
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

    converter = new MarkdownImageConverter(
      mockEntityService,
      logger,
      mockFetcher,
    );
  });

  describe("detectInlineImages", () => {
    test("should detect single inline image URL", () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is some text.

![Alt text](https://example.com/image.png)

More text here.`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sourceUrl: "https://example.com/image.png",
        alt: "Alt text",
        originalMarkdown: "![Alt text](https://example.com/image.png)",
        postSlug: "test-post",
      });
    });

    test("should detect multiple inline images", () => {
      const content = `---
title: Test Post
slug: test-post
---

First image: ![First](https://example.com/first.png)

Second image: ![Second](https://example.com/second.jpg)

Third image: ![Third](https://cdn.site.com/third.webp)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(3);
      expect(result[0]?.sourceUrl).toBe("https://example.com/first.png");
      expect(result[1]?.sourceUrl).toBe("https://example.com/second.jpg");
      expect(result[2]?.sourceUrl).toBe("https://cdn.site.com/third.webp");
    });

    test("should skip images in fenced code blocks", () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is a real image: ![Real](https://example.com/real.png)

\`\`\`markdown
This is a code example: ![Code](https://example.com/code.png)
\`\`\`

Another real image: ![Another](https://example.com/another.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(2);
      expect(result[0]?.sourceUrl).toBe("https://example.com/real.png");
      expect(result[1]?.sourceUrl).toBe("https://example.com/another.png");
    });

    test("should skip images in indented code blocks", () => {
      const content = `---
title: Test Post
slug: test-post
---

Real image: ![Real](https://example.com/real.png)

    // This is indented code
    ![Indented](https://example.com/indented.png)

Back to normal.`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("https://example.com/real.png");
    });

    test("should skip images in inline code", () => {
      const content = `---
title: Test Post
slug: test-post
---

Real image: ![Real](https://example.com/real.png)

Inline code example: \`![Inline](https://example.com/inline.png)\`

More text.`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("https://example.com/real.png");
    });

    test("should skip non-HTTP URLs", () => {
      const content = `---
title: Test Post
slug: test-post
---

HTTP image: ![HTTP](https://example.com/http.png)

Local image: ![Local](./local-image.png)

Relative image: ![Relative](images/relative.png)

Data URL: ![Data](data:image/png;base64,abc123)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("https://example.com/http.png");
    });

    test("should handle images with empty alt text", () => {
      const content = `---
title: Test Post
slug: test-post
---

![](https://example.com/no-alt.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.alt).toBe("");
      expect(result[0]?.sourceUrl).toBe("https://example.com/no-alt.png");
    });

    test("should handle images with complex alt text", () => {
      const content = `---
title: Test Post
slug: test-post
---

![A **complex** alt with [special] chars!](https://example.com/complex.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      // AST parser strips markdown formatting from alt text
      expect(result[0]?.alt).toBe("A complex alt with [special] chars!");
    });

    test("should return empty array if no images found", () => {
      const content = `---
title: Test Post
slug: test-post
---

Just plain text without any images.`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(0);
    });

    test("should return empty array for content without frontmatter", () => {
      const content = `Just plain text without frontmatter.

![Image](https://example.com/image.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      // Should still detect images even without frontmatter
      expect(result).toHaveLength(1);
    });

    test("should skip already converted entity:// references", () => {
      const content = `---
title: Test Post
slug: test-post
---

Already converted: ![Converted](entity://image/existing-id)

Not converted: ![New](https://example.com/new.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("https://example.com/new.png");
    });

    test("should handle http:// URLs (not just https://)", () => {
      const content = `---
title: Test Post
slug: test-post
---

![HTTP](http://example.com/image.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("http://example.com/image.png");
    });

    test("should handle images with title attribute", () => {
      const content = `---
title: Test Post
slug: test-post
---

![Alt text](https://example.com/image.png "Image title")`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceUrl).toBe("https://example.com/image.png");
      expect(result[0]?.originalMarkdown).toBe(
        '![Alt text](https://example.com/image.png "Image title")',
      );
    });

    test("should handle nested code blocks correctly", () => {
      const content = `---
title: Test Post
slug: test-post
---

Real: ![Real](https://example.com/real.png)

\`\`\`javascript
const md = \`![Nested](https://example.com/nested.png)\`;
\`\`\`

Also real: ![Also](https://example.com/also.png)`;

      const result = converter.detectInlineImages(content, "test-post");

      expect(result).toHaveLength(2);
      expect(result[0]?.sourceUrl).toBe("https://example.com/real.png");
      expect(result[1]?.sourceUrl).toBe("https://example.com/also.png");
    });
  });

  describe("convert", () => {
    test("should convert inline image URL to entity reference", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Here is an image: ![Alt text](https://example.com/image.png)`;

      const result = await converter.convert(content, "test-post");

      expect(result.converted).toBe(true);
      expect(result.content).toContain("entity://image/");
      expect(result.content).not.toContain("https://example.com/image.png");
      expect(result.convertedCount).toBe(1);
    });

    test("should convert multiple images", async () => {
      const content = `---
title: Test Post
slug: test-post
---

First: ![First](https://example.com/first.png)

Second: ![Second](https://example.com/second.png)`;

      const result = await converter.convert(content, "test-post");

      expect(result.converted).toBe(true);
      expect(result.convertedCount).toBe(2);
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(2);
    });

    test("should not modify content if no images to convert", async () => {
      const content = `---
title: Test Post
slug: test-post
---

Just plain text.`;

      const result = await converter.convert(content, "test-post");

      expect(result.converted).toBe(false);
      expect(result.content).toBe(content);
      expect(result.convertedCount).toBe(0);
    });

    test("should preserve alt text in entity reference", async () => {
      const content = `---
title: Test Post
slug: test-post
---

![Beautiful sunset](https://example.com/sunset.png)`;

      const result = await converter.convert(content, "test-post");

      expect(result.content).toContain("![Beautiful sunset](entity://image/");
    });

    test("should generate unique image IDs based on post slug", async () => {
      const content = `---
title: Test Post
slug: my-post
---

![First](https://example.com/first.png)

![Second](https://example.com/second.png)`;

      await converter.convert(content, "my-post");

      const calls = (mockEntityService.createEntity as ReturnType<typeof mock>)
        .mock.calls;
      expect(calls[0]?.[0]?.id).toMatch(/^my-post-inline-/);
      expect(calls[1]?.[0]?.id).toMatch(/^my-post-inline-/);
    });

    test("should reuse existing image entity with same sourceUrl", async () => {
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

      const converterWithExisting = new MarkdownImageConverter(
        entityServiceWithExisting,
        localLogger,
        localFetcher,
      );

      const content = `---
title: Test Post
slug: test-post
---

![Alt](https://example.com/image.png)`;

      const result = await converterWithExisting.convert(content, "test-post");

      expect(result.converted).toBe(true);
      expect(result.content).toContain("entity://image/existing-image-id");
      expect(localFetcher).not.toHaveBeenCalled();
      expect(entityServiceWithExisting.createEntity).not.toHaveBeenCalled();
    });

    test("should handle fetch failure gracefully for individual images", async () => {
      mockFetcher.mockRejectedValueOnce(new Error("Network error"));

      const content = `---
title: Test Post
slug: test-post
---

![Will fail](https://example.com/fail.png)

![Will succeed](https://example.com/success.png)`;

      const result = await converter.convert(content, "test-post");

      // First image fails, second succeeds
      expect(result.convertedCount).toBe(1);
      expect(result.content).toContain("https://example.com/fail.png");
      expect(result.content).toContain("entity://image/");
    });

    test("should use alt text for image metadata", async () => {
      const content = `---
title: Test Post
slug: test-post
---

![A beautiful landscape photo](https://example.com/landscape.png)`;

      await converter.convert(content, "test-post");

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            alt: "A beautiful landscape photo",
            sourceUrl: "https://example.com/landscape.png",
          }),
        }),
      );
    });

    test("should generate title from alt if provided", async () => {
      const content = `---
title: Test Post
slug: test-post
---

![Sunset over mountains](https://example.com/sunset.png)`;

      await converter.convert(content, "test-post");

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: "Sunset over mountains",
          }),
        }),
      );
    });

    test("should generate fallback title for images without alt", async () => {
      const content = `---
title: Test Post
slug: test-post
---

![](https://example.com/image.png)`;

      await converter.convert(content, "test-post");

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            title: expect.stringContaining("Inline image"),
          }),
        }),
      );
    });
  });
});
