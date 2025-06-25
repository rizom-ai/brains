import { describe, it, expect } from "bun:test";
import {
  SiteContentPreviewAdapter,
  SiteContentProductionAdapter,
} from "../../src/entities/site-content-adapter";
import type { SiteContentPreview, SiteContentProduction } from "@brains/types";

describe("SiteContentPreviewAdapter", () => {
  const adapter = new SiteContentPreviewAdapter();

  describe("toMarkdown", () => {
    it("should include page and section in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content\n\nThis is test content.",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("# Test Content");
      expect(markdown).toContain("This is test content.");
    });

    it("should not include deprecated fields in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Preview Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("# Preview Content");
      expect(markdown).not.toContain("environment");
      expect(markdown).not.toContain("promotedAt");
    });

    it("should handle content that already has frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "---\nexistingKey: value\n---\n# Existing Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("# Existing Content");
      // Should not contain the original frontmatter key
      expect(markdown).not.toContain("existingKey: value");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter correctly", () => {
      const markdown = `---
page: landing
section: hero
---
# Test Content

This is test content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.content).toBe(markdown);
    });

    it("should ignore deprecated fields in frontmatter", () => {
      const markdown = `---
page: landing
section: hero
environment: production
promotedAt: '2024-01-01T00:00:00Z'
promotedBy: admin
promotedFrom: preview
---
# Legacy Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.content).toBe(markdown);
      // Legacy fields should be ignored
      expect(result).not.toHaveProperty("environment");
      expect(result).not.toHaveProperty("promotionMetadata");
    });

    it("should parse minimal frontmatter", () => {
      const markdown = `---
page: landing
section: hero
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.content).toBe(markdown);
    });

    it("should handle missing optional fields", () => {
      const markdown = `---
page: landing
section: hero
---
# Simple Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should extract basic metadata", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        page: "landing",
        section: "hero",
      });
    });

    it("should not include deprecated fields in metadata", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        page: "landing",
        section: "hero",
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
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("page: landing");
      expect(frontmatter).toContain("section: hero");
      expect(frontmatter).not.toContain("environment");
    });

    it("should not include deprecated fields in frontmatter", () => {
      const entity: SiteContentPreview = {
        id: "test-id",
        entityType: "site-content-preview",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("page: landing");
      expect(frontmatter).toContain("section: hero");
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
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("# Production Content");
      expect(markdown).toContain("This is production content.");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter correctly", () => {
      const markdown = `---
page: landing
section: hero
---
# Production Content

This is production content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should extract basic metadata", () => {
      const entity: SiteContentProduction = {
        id: "test-id",
        entityType: "site-content-production",
        content: "# Production Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        page: "landing",
        section: "hero",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string", () => {
      const entity: SiteContentProduction = {
        id: "test-id",
        entityType: "site-content-production",
        content: "# Production Content",
        page: "landing",
        section: "hero",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("page: landing");
      expect(frontmatter).toContain("section: hero");
    });
  });
});
