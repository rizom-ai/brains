import { describe, it, expect } from "bun:test";
import { SiteContentAdapter } from "../../src/site-content-adapter";
import type { SiteContent } from "../../src/schemas";

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
      
      expect(markdown).toContain("page: landing");
      expect(markdown).toContain("section: hero");
      expect(markdown).toContain("environment: preview");
      expect(markdown).toContain("# Test Content");
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
          promotedBy: "test-user",
          promotedFrom: "preview-id",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);
      
      expect(markdown).toContain("environment: production");
      expect(markdown).toContain("promotedAt: '2024-01-01T00:00:00Z'");
      expect(markdown).toContain("promotedBy: test-user");
      expect(markdown).toContain("promotedFrom: preview-id");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse environment from frontmatter", () => {
      const markdown = `---
page: landing
section: hero
environment: production
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);
      
      expect(result.page).toBe("landing");
      expect(result.section).toBe("hero");
      expect(result.environment).toBe("production");
    });

    it("should default to preview if environment not specified", () => {
      const markdown = `---
page: landing
section: hero
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);
      
      expect(result.environment).toBe("preview");
    });

    it("should parse promotion metadata from frontmatter", () => {
      const markdown = `---
page: landing
section: hero
environment: production
promotedAt: '2024-01-01T00:00:00Z'
promotedBy: test-user
promotedFrom: preview-id
---
# Test Content`;

      const result = adapter.fromMarkdown(markdown);
      
      expect(result.environment).toBe("production");
      expect(result.promotionMetadata).toEqual({
        promotedAt: "2024-01-01T00:00:00Z",
        promotedBy: "test-user",
        promotedFrom: "preview-id",
      });
    });
  });
});