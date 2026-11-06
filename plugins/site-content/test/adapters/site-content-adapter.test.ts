import { describe, it, expect } from "bun:test";
import { siteContentAdapter } from "../../src/adapters/site-content-adapter";
import { createMockSiteContent } from "../fixtures/site-entities";

describe("SiteContentAdapter", () => {
  const adapter = siteContentAdapter;

  describe("toMarkdown", () => {
    it("writes the section body without copies of its route and section", () => {
      const entity = createMockSiteContent({
        id: "landing:hero",
        content: "# Test Content\n\nThis is test content.",
        metadata: {},
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).not.toContain("routeId");
      expect(markdown).not.toContain("sectionId");
      expect(markdown).toContain("# Test Content");
      expect(markdown).toContain("This is test content.");
    });
  });

  describe("fromMarkdown", () => {
    it("reads a section stored with route and section copies", () => {
      const markdown = `---
routeId: landing
sectionId: hero
---

# Hero Section

Welcome to our site!`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("site-content");
      expect(result.content).toBe(markdown);
    });

    it("reads a section with no frontmatter", () => {
      const result = adapter.fromMarkdown("# Content\n\nBody.");

      expect(result.metadata).toEqual({});
      expect(result.content).toBe("# Content\n\nBody.");
    });
  });
});
