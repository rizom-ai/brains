import { describe, it, expect, beforeEach } from "bun:test";
import { SiteInfoAdapter } from "../../src/services/site-info-adapter";
import { z, computeContentHash } from "@brains/utils";
import { createMockSiteInfo } from "../fixtures/site-entities";

describe("SiteInfoAdapter", () => {
  let adapter: SiteInfoAdapter;

  beforeEach(() => {
    adapter = new SiteInfoAdapter();
  });

  describe("schema", () => {
    it("should have valid site-info schema", () => {
      const schema = adapter.schema;
      const content = "";

      const validSiteInfo = {
        id: "site-info",
        entityType: "site-info",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(validSiteInfo)).not.toThrow();
    });

    it("should reject invalid entity type", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidSiteInfo = {
        id: "site-info",
        entityType: "other",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });

    it("should reject invalid ID", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidSiteInfo = {
        id: "wrong-id",
        entityType: "site-info",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert site info entity to structured markdown with CTA", () => {
      const content = adapter.createSiteInfoContent({
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        copyright: "© 2025 Rizom",
        themeMode: "dark",
        cta: {
          heading: "Unlock your full potential",
          buttonText: "Join Rizom",
          buttonLink: "https://www.linkedin.com/company/rizom-collective",
        },
      });

      const entity = createMockSiteInfo({ content });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("# Site Information");
      expect(markdown).toContain("## Title");
      expect(markdown).toContain("Rizom");
      expect(markdown).toContain("## Description");
      expect(markdown).toContain("The Rizom collective's knowledge hub");
      expect(markdown).toContain("## Theme Mode");
      expect(markdown).toContain("dark");
      expect(markdown).toContain("## CTA");
      expect(markdown).toContain("### Heading");
      expect(markdown).toContain("Unlock your full potential");
      expect(markdown).toContain("### Button Text");
      expect(markdown).toContain("Join Rizom");
      expect(markdown).toContain("### Button Link");
      expect(markdown).toContain(
        "https://www.linkedin.com/company/rizom-collective",
      );
    });

    it("should convert site info entity without optional fields", () => {
      const content = adapter.createSiteInfoContent({
        title: "My Site",
        description: "A simple website",
      });

      const entity = createMockSiteInfo({ content });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("# Site Information");
      expect(markdown).toContain("## Title");
      expect(markdown).toContain("My Site");
      expect(markdown).toContain("## Description");
      expect(markdown).toContain("A simple website");
    });
  });

  describe("parseSiteInfoBody", () => {
    it("should parse structured markdown with all fields", () => {
      const markdown = `# Site Information

## Title
Rizom

## Description
The Rizom collective's knowledge hub

## Copyright
© 2025 Rizom

## Theme Mode
dark

## CTA

### Heading
Unlock your full potential

### Button Text
Join Rizom

### Button Link
https://www.linkedin.com/company/rizom-collective`;

      const result = adapter.parseSiteInfoBody(markdown);

      expect(result.title).toBe("Rizom");
      expect(result.description).toBe("The Rizom collective's knowledge hub");
      expect(result.copyright).toBe("© 2025 Rizom");
      expect(result.themeMode).toBe("dark");
      expect(result.cta).toEqual({
        heading: "Unlock your full potential",
        buttonText: "Join Rizom",
        buttonLink: "https://www.linkedin.com/company/rizom-collective",
      });
    });

    it("should parse structured markdown without CTA", () => {
      const markdown = `# Site Information

## Title
My Site

## Description
A simple website`;

      const result = adapter.parseSiteInfoBody(markdown);

      expect(result.title).toBe("My Site");
      expect(result.description).toBe("A simple website");
      expect(result.cta).toBeUndefined();
    });

    it("should throw error for markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      expect(() => adapter.parseSiteInfoBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseSiteInfoBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });
  });

  describe("fromMarkdown", () => {
    it("should create partial entity from markdown", () => {
      const markdown = `# Site Information

## Title
My Site

## Description
A simple website`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("site-info");
      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should return empty metadata (site-info doesn't use metadata)", () => {
      const content = adapter.createSiteInfoContent({
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        themeMode: "dark",
      });

      const entity = createMockSiteInfo({ content });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({});
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string (site-info uses structured content, not frontmatter)", () => {
      const entity = createMockSiteInfo({ content: "" });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toBe("");
    });
  });

  describe("parseFrontMatter", () => {
    it("should return empty object (site-info doesn't use frontmatter)", () => {
      const markdown = `---
title: Site
---

Content`;

      const result = adapter.parseFrontMatter(markdown, z.object({}));

      expect(result).toEqual({});
    });
  });

  describe("roundtrip conversion", () => {
    it("should preserve data through createSiteInfoContent and parseSiteInfoBody", () => {
      const originalData = {
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        copyright: "© 2025 Rizom",
        themeMode: "dark" as const,
        cta: {
          heading: "Unlock your full potential",
          buttonText: "Join Rizom",
          buttonLink: "https://www.linkedin.com/company/rizom-collective",
        },
      };

      // Create content
      const content = adapter.createSiteInfoContent(originalData);

      // Parse it back
      const parsed = adapter.parseSiteInfoBody(content);

      // Should preserve all data
      expect(parsed.title).toBe(originalData.title);
      expect(parsed.description).toBe(originalData.description);
      expect(parsed.copyright).toBe(originalData.copyright);
      expect(parsed.themeMode).toBe(originalData.themeMode);
      expect(parsed.cta).toEqual(originalData.cta);
    });

    it("should preserve data without optional fields", () => {
      const originalData = {
        title: "My Site",
        description: "A simple website",
      };

      // Create content
      const content = adapter.createSiteInfoContent(originalData);

      // Parse it back
      const parsed = adapter.parseSiteInfoBody(content);

      // Should preserve required data
      expect(parsed.title).toBe(originalData.title);
      expect(parsed.description).toBe(originalData.description);
      expect(parsed.cta).toBeUndefined();
    });
  });
});
