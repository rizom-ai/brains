import { describe, expect, test } from "bun:test";
import { SiteContentFormatter } from "../src/formatter";
import type { SiteContent } from "../src/schema";

describe("SiteContentFormatter", () => {
  const formatter = new SiteContentFormatter();

  const mockSiteContent: SiteContent = {
    id: "test-123",
    entityType: "site-content",
    title: "landing:hero",
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

  test("canFormat should return true for valid site content", () => {
    expect(formatter.canFormat(mockSiteContent)).toBe(true);
  });

  test("canFormat should return false for non-site-content data", () => {
    const invalidData = { ...mockSiteContent, entityType: "note" };
    expect(formatter.canFormat(invalidData)).toBe(false);
  });

  test("format should return formatted markdown", () => {
    const result = formatter.format(mockSiteContent);

    expect(result).toContain("# Site Content: landing/hero");
    expect(result).toContain("**Page:** landing");
    expect(result).toContain("**Section:** hero");
    expect(result).toContain("**Updated:**");
    expect(result).toContain("```yaml");
    expect(result).toContain("headline: Your Personal Knowledge Hub");
    expect(result).toContain("ctaText: Get Started");
    expect(result).toContain("## Tags");
    expect(result).toContain("- landing");
    expect(result).toContain("- hero");
  });

  test("format should handle missing tags", () => {
    const contentWithoutTags = { ...mockSiteContent, tags: [] };
    const result = formatter.format(contentWithoutTags);

    expect(result).not.toContain("## Tags");
  });

  test("format should handle invalid data gracefully", () => {
    const invalidData = { foo: "bar" };
    const result = formatter.format(invalidData);

    expect(result).toContain("Error: Invalid site content data");
  });
});
