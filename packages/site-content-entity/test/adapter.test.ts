import { describe, expect, test } from "bun:test";
import { siteContentAdapter } from "../src/adapter";
import type { SiteContent } from "../src/schema";

describe("SiteContentAdapter", () => {
  const mockSiteContent: SiteContent = {
    id: "test-123",
    entityType: "site-content",
    title: "Landing Page Hero",
    content: "Hero section content for the landing page",
    page: "landing",
    section: "hero",
    data: {
      headline: "Your Personal Knowledge Hub",
      subheadline: "Organize, connect, and discover your digital thoughts",
      ctaText: "Get Started",
      ctaLink: "/dashboard",
    },
    tags: ["landing", "hero", "generated"],
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
  };

  test("toMarkdown should convert entity to markdown with YAML data", () => {
    const markdown = siteContentAdapter.toMarkdown(mockSiteContent);

    expect(markdown).toContain("page: landing");
    expect(markdown).toContain("section: hero");
    expect(markdown).toContain("headline: Your Personal Knowledge Hub");
    expect(markdown).toContain("ctaText: Get Started");
  });

  test("fromMarkdown should extract entity fields from markdown", () => {
    const markdown = `---
page: landing
section: hero
---

headline: Test Headline
subheadline: Test Subheadline
ctaText: Click Me
ctaLink: /test
`;

    const result = siteContentAdapter.fromMarkdown(markdown);

    expect(result.page).toBe("landing");
    expect(result.section).toBe("hero");
    expect(result.data).toEqual({
      headline: "Test Headline",
      subheadline: "Test Subheadline",
      ctaText: "Click Me",
      ctaLink: "/test",
    });
  });
});
