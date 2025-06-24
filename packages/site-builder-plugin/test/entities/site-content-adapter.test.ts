import { describe, it, expect } from "bun:test";
import { SiteContentAdapter } from "../../src/entities/site-content-adapter";
import type { SiteContent } from "@brains/types";

describe("SiteContentAdapter", () => {
  const adapter = new SiteContentAdapter();

  describe("toMarkdown", () => {
    it("should include environment in frontmatter", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Test Content\n\nThis is test content.",
        page: "landing",
        section: "hero",
        environment: "preview",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("environment: preview");
      expect(markdown).toContain("# Test Content");
      expect(markdown).toContain("This is test content.");
    });

    it("should include promotion metadata when present", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Promoted Content",
        page: "landing",
        section: "hero",
        environment: "production",
        promotionMetadata: {
          promotedAt: "2024-01-01T00:00:00Z",
          promotedBy: "admin",
          promotedFrom: "preview",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("promotedAt: '2024-01-01T00:00:00Z'");
      expect(markdown).toContain("promotedBy: admin");
      expect(markdown).toContain("promotedFrom: preview");
    });

    it("should handle content that already has frontmatter", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "---\nexistingKey: value\n---\n# Existing Content",
        page: "landing",
        section: "hero",
        environment: "preview",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("environment: preview");
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
environment: preview
---
# Test Content

This is test content.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.environment).toBe("preview");
      expect(result.content).toBe(markdown);
    });

    it("should parse promotion metadata when present", () => {
      const markdown = `---
page: landing
section: hero
environment: production
promotedAt: '2024-01-01T00:00:00Z'
promotedBy: admin
promotedFrom: preview
---
# Promoted Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.environment).toBe("production");
      expect(result.promotionMetadata).toEqual({
        promotedAt: "2024-01-01T00:00:00Z",
        promotedBy: "admin",
        promotedFrom: "preview",
      });
    });

    it("should default environment to preview if not specified", () => {
      const markdown = `---
page: landing
section: hero
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.environment).toBe("preview");
    });

    it("should handle partial promotion metadata", () => {
      const markdown = `---
page: landing
section: hero
environment: production
promotedAt: '2024-01-01T00:00:00Z'
---
# Partially Promoted Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.promotionMetadata).toEqual({
        promotedAt: "2024-01-01T00:00:00Z",
        promotedBy: undefined,
        promotedFrom: undefined,
      });
    });
  });

  describe("extractMetadata", () => {
    it("should extract basic metadata", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        environment: "preview",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        page: "landing",
        section: "hero",
        environment: "preview",
      });
    });

    it("should include promotion metadata when present", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        environment: "production",
        promotionMetadata: {
          promotedAt: "2024-01-01T00:00:00Z",
          promotedBy: "admin",
          promotedFrom: "preview",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        page: "landing",
        section: "hero",
        environment: "production",
        promotedAt: "2024-01-01T00:00:00Z",
        promotedBy: "admin",
        promotedFrom: "preview",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        environment: "preview",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("page: landing");
      expect(frontmatter).toContain("section: hero");
      expect(frontmatter).toContain("environment: preview");
    });

    it("should include promotion metadata in frontmatter", () => {
      const entity: SiteContent = {
        id: "test-id",
        entityType: "site-content",
        content: "# Test Content",
        page: "landing",
        section: "hero",
        environment: "production",
        promotionMetadata: {
          promotedAt: "2024-01-01T00:00:00Z",
          promotedBy: "admin",
          promotedFrom: "preview",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const frontmatter = adapter.generateFrontMatter(entity);

      expect(frontmatter).toContain("promotedAt: '2024-01-01T00:00:00Z'");
      expect(frontmatter).toContain("promotedBy: admin");
      expect(frontmatter).toContain("promotedFrom: preview");
    });
  });
});
