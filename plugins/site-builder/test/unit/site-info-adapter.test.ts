import { describe, it, expect, beforeEach } from "bun:test";
import { SiteInfoAdapter } from "../../src/services/site-info-adapter";
import type { SiteInfoEntity } from "../../src/services/site-info-schema";
import { z } from "@brains/utils";

describe("SiteInfoAdapter", () => {
  let adapter: SiteInfoAdapter;

  beforeEach(() => {
    adapter = new SiteInfoAdapter();
  });

  describe("schema", () => {
    it("should have valid site-info schema", () => {
      const schema = adapter.schema;

      const validSiteInfo = {
        id: "site-info",
        entityType: "site-info",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(validSiteInfo)).not.toThrow();
    });

    it("should reject invalid entity type", () => {
      const schema = adapter.schema;

      const invalidSiteInfo = {
        id: "site-info",
        entityType: "other",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });

    it("should reject invalid ID", () => {
      const schema = adapter.schema;

      const invalidSiteInfo = {
        id: "wrong-id",
        entityType: "site-info",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert site info entity to structured markdown with CTA", () => {
      const content = adapter.createSiteInfoContent({
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        url: "https://rizom.ai",
        copyright: "© 2025 Rizom",
        themeMode: "dark",
        cta: {
          heading: "Unlock your full potential",
          buttonText: "Join Rizom",
          buttonLink: "https://www.linkedin.com/company/rizom-collective",
        },
      });

      const entity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("# Site Information");
      expect(markdown).toContain("## Title");
      expect(markdown).toContain("Rizom");
      expect(markdown).toContain("## Description");
      expect(markdown).toContain("The Rizom collective's knowledge hub");
      expect(markdown).toContain("## URL");
      expect(markdown).toContain("https://rizom.ai");
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

      const entity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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

## URL
https://rizom.ai

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
      expect(result.url).toBe("https://rizom.ai");
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
    it("should extract title and themeMode as metadata", () => {
      const content = adapter.createSiteInfoContent({
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        themeMode: "dark",
      });

      const entity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        title: "Rizom",
        themeMode: "dark",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string (site-info uses structured content, not frontmatter)", () => {
      const entity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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
        url: "https://rizom.ai",
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
      expect(parsed.url).toBe(originalData.url);
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
      expect(parsed.url).toBeUndefined();
      expect(parsed.cta).toBeUndefined();
    });

    it("should preserve socialLinks array through roundtrip", () => {
      const originalData = {
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        socialLinks: [
          {
            platform: "linkedin" as const,
            url: "https://www.linkedin.com/company/rizom-collective",
            label: "Follow us on LinkedIn",
          },
          {
            platform: "github" as const,
            url: "https://github.com/rizom-ai",
            label: "View our code on GitHub",
          },
          {
            platform: "email" as const,
            url: "mailto:contact@rizom.ai",
            label: "Email us",
          },
        ],
      };

      // Create content
      const content = adapter.createSiteInfoContent(originalData);

      // Parse it back
      const parsed = adapter.parseSiteInfoBody(content);

      // Should preserve all data including socialLinks
      expect(parsed.title).toBe(originalData.title);
      expect(parsed.description).toBe(originalData.description);
      expect(parsed.socialLinks).toEqual(originalData.socialLinks);
    });

    it("should parse socialLinks from properly formatted markdown", () => {
      const markdown = `# Site Information

## Title
Rizom

## Description
The Rizom collective's knowledge hub

## Social Links

### Social Link 1

#### Platform
linkedin

#### URL
https://www.linkedin.com/company/rizom-collective

#### Label
Follow us on LinkedIn

### Social Link 2

#### Platform
github

#### URL
https://github.com/rizom-ai

#### Label
View our code on GitHub`;

      const result = adapter.parseSiteInfoBody(markdown);

      expect(result.socialLinks).toEqual([
        {
          platform: "linkedin",
          url: "https://www.linkedin.com/company/rizom-collective",
          label: "Follow us on LinkedIn",
        },
        {
          platform: "github",
          url: "https://github.com/rizom-ai",
          label: "View our code on GitHub",
        },
      ]);
    });
  });
});
