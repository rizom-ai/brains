import { describe, it, expect } from "bun:test";
import {
  SiteContentPreviewAdapter,
  SiteContentProductionAdapter,
} from "../../src/entities/site-content-adapter";
import type {
  SiteContentPreview,
  SiteContentProduction,
} from "../../src/types";

describe("SiteContentPreviewAdapter", () => {
  const adapter = new SiteContentPreviewAdapter();

  describe("toMarkdown", () => {
    it("should include page and section in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content\n\nThis is test content.",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("pageId: landing");
      expect(markdown).toContain("sectionId: hero");
      expect(markdown).toContain("# Test Content");
      expect(markdown).toContain("This is test content.");
    });

    it("should not include deprecated fields in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Preview Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("pageId: landing");
      expect(markdown).toContain("sectionId: hero");
      expect(markdown).toContain("# Preview Content");
      expect(markdown).not.toContain("environment");
      expect(markdown).not.toContain("promotedAt");
    });

    it("should handle content that already has frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "---\nexistingKey: value\n---\n# Existing Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("pageId: landing");
      expect(markdown).toContain("sectionId: hero");
      expect(markdown).toContain("# Existing Content");
      // Should not contain the original frontmatter key
      expect(markdown).not.toContain("existingKey: value");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter correctly", () => {
      const markdown = `---
pageId: landing
sectionId: hero
---
# Test Content

This is test content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.content).toBe(markdown);
    });

    it("should ignore deprecated fields in frontmatter", () => {
      const markdown = `---
pageId: landing
sectionId: hero
environment: production
promotedAt: '2024-01-01T00:00:00Z'
promotedBy: admin
promotedFrom: preview
---
# Legacy Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.content).toBe(markdown);
      // Legacy fields should be ignored
      expect(result).not.toHaveProperty("environment");
      expect(result).not.toHaveProperty("promotionMetadata");
    });

    it("should parse minimal frontmatter", () => {
      const markdown = `---
pageId: landing
sectionId: hero
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.content).toBe(markdown);
    });

    it("should handle missing optional fields", () => {
      const markdown = `---
pageId: landing
sectionId: hero
---
# Simple Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should extract basic metadata", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        pageId: "landing",
        sectionId: "hero",
      });
    });

    it("should not include deprecated fields in metadata", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        pageId: "landing",
        sectionId: "hero",
      });
      expect(metadata).not.toHaveProperty("environment");
      expect(metadata).not.toHaveProperty("promotedAt");
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("pageId: landing");
      expect(frontmatter).toContain("sectionId: hero");
      expect(frontmatter).not.toContain("environment");
    });

    it("should not include deprecated fields in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("pageId: landing");
      expect(frontmatter).toContain("sectionId: hero");
      expect(frontmatter).not.toContain("environment");
      expect(frontmatter).not.toContain("promotedAt");
      expect(frontmatter).not.toContain("promotedBy");
      expect(frontmatter).not.toContain("promotedFrom");
    });
  });
});

describe("SiteContentProductionAdapter", () => {
  const adapter = new SiteContentProductionAdapter();

  describe("toMarkdown", () => {
    it("should include page and section in frontmatter", () => {
      const entity: SiteContentProduction = {
        id: "test-id",
        entityType: "site-content-production",
        content: "# Production Content\\n\\nThis is production content.",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("pageId: landing");
      expect(markdown).toContain("sectionId: hero");
      expect(markdown).toContain("# Production Content");
      expect(markdown).toContain("This is production content.");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter correctly", () => {
      const markdown = `---
pageId: landing
sectionId: hero
---
# Production Content

This is production content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should extract basic metadata", () => {
      const entity: SiteContentProduction = {
        id: "test-id",
        entityType: "site-content-production",
        content: "# Production Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        pageId: "landing",
        sectionId: "hero",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string", () => {
      const entity: SiteContentProduction = {
        id: "test-id",
        entityType: "site-content-production",
        content: "# Production Content",
        pageId: "landing",
        sectionId: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("pageId: landing");
      expect(frontmatter).toContain("sectionId: hero");
    });
  });
});
