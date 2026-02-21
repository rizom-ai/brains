import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { siteContentAdapter } from "../../src/adapters/site-content-adapter";
import { createMockSiteContent } from "../fixtures/site-entities";

describe("SiteContentAdapter", () => {
  const adapter = siteContentAdapter;

  describe("toMarkdown", () => {
    it("should include routeId and sectionId in frontmatter", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: "# Test Content\n\nThis is test content.",
        metadata: { routeId: "landing", sectionId: "hero" },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("routeId: landing");
      expect(markdown).toContain("sectionId: hero");
      expect(markdown).toContain("# Test Content");
      expect(markdown).toContain("This is test content.");
    });

    it("should handle content that already has frontmatter", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: `---
title: Existing Title
author: John Doe
---

# Content with existing frontmatter

This content already had frontmatter.`,
        metadata: { routeId: "about", sectionId: "main" },
      });

      const markdown = adapter.toMarkdown(entity);

      // Should update the frontmatter with routeId and sectionId
      expect(markdown).toContain("routeId: about");
      expect(markdown).toContain("sectionId: main");
      expect(markdown).toContain("# Content with existing frontmatter");
    });

    it("should handle content without frontmatter", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: "Plain text content without frontmatter",
        metadata: { routeId: "contact", sectionId: "form" },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("routeId: contact");
      expect(markdown).toContain("sectionId: form");
      expect(markdown).toContain("Plain text content without frontmatter");
    });
  });

  describe("fromMarkdown", () => {
    it("should extract routeId and sectionId from frontmatter", () => {
      const markdown = `---
routeId: landing
sectionId: hero
---

# Hero Section

Welcome to our site!`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.routeId).toBe("landing");
      expect(result.metadata?.sectionId).toBe("hero");
      expect(result.content).toBe(markdown); // Store full markdown
    });

    it("should handle markdown without required fields", () => {
      const markdown = `---
title: Some Title
---

# Content`;

      expect(() => adapter.fromMarkdown(markdown)).toThrow();
    });
  });

  describe("extractMetadata", () => {
    it("should return metadata with routeId and sectionId", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: "Content",
        metadata: { routeId: "products", sectionId: "list" },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({ routeId: "products", sectionId: "list" });
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter with custom schema", () => {
      const markdown = `---
routeId: landing
sectionId: hero
customField: value
---

# Content`;

      const schema = z.object({
        routeId: z.string(),
        sectionId: z.string(),
        customField: z.string().optional(),
      });

      const result = adapter.parseFrontMatter(markdown, schema);

      expect(result).toEqual({
        routeId: "landing",
        sectionId: "hero",
        customField: "value",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string for entity", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: "Content",
        metadata: { routeId: "blog", sectionId: "posts" },
      });

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("routeId: blog");
      expect(frontmatter).toContain("sectionId: posts");
      expect(frontmatter).toStartWith("---");
      expect(frontmatter).toEndWith("---");
    });
  });

  describe("entity type", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("site-content");
    });

    it("should have correct schema", () => {
      const entity = createMockSiteContent({
        id: "test-id",
        content: "Test content",
        metadata: { routeId: "test-route", sectionId: "test-section" },
      });

      const result = adapter.schema.safeParse(entity);
      expect(result.success).toBe(true);
    });
  });
});
