import { describe, it, expect, beforeEach } from "bun:test";
import { SiteInfoAdapter } from "../../src/services/site-info-adapter";
import { z } from "@brains/utils";
import { createMockSiteInfo } from "../fixtures/site-entities";
import { createTestEntity } from "@brains/test-utils";

describe("SiteInfoAdapter", () => {
  let adapter: SiteInfoAdapter;

  beforeEach(() => {
    adapter = new SiteInfoAdapter();
  });

  describe("schema", () => {
    it("should have valid site-info schema", () => {
      const schema = adapter.schema;
      const content = "";

      const validSiteInfo = createTestEntity("site-info", {
        id: "site-info",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      });

      expect(() => schema.parse(validSiteInfo)).not.toThrow();
    });

    it("should reject invalid entity type", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidSiteInfo = {
        ...createTestEntity("other", {
          id: "site-info",
          content,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          metadata: {},
        }),
      };

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });

    it("should reject invalid ID", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidSiteInfo = createTestEntity("site-info", {
        id: "wrong-id",
        content,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      });

      expect(() => schema.parse(invalidSiteInfo)).toThrow();
    });
  });

  describe("frontmatterSchema", () => {
    it("should expose frontmatterSchema for CMS", () => {
      expect(adapter.frontmatterSchema).toBeDefined();
      expect(adapter.frontmatterSchema.shape).toHaveProperty("title");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("description");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("cta");
    });

    it("should be a singleton", () => {
      expect(adapter.isSingleton).toBe(true);
    });

    it("should not have a body", () => {
      expect(adapter.hasBody).toBe(false);
    });
  });

  describe("toMarkdown", () => {
    it("should convert site info entity to frontmatter format with CTA", () => {
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

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Rizom");
      expect(markdown).toContain("description:");
      expect(markdown).toContain("knowledge hub");
      expect(markdown).toContain("themeMode: dark");
      expect(markdown).toContain("heading: Unlock your full potential");
      expect(markdown).toContain("buttonText: Join Rizom");
      expect(markdown).toMatch(
        /buttonLink:.*linkedin\.com\/company\/rizom-collective/,
      );
    });

    it("should convert site info entity without optional fields", () => {
      const content = adapter.createSiteInfoContent({
        title: "My Site",
        description: "A simple website",
      });

      const entity = createMockSiteInfo({ content });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: My Site");
      expect(markdown).toContain("description: A simple website");
    });
  });

  describe("parseSiteInfoBody", () => {
    it("should parse frontmatter format with all fields", () => {
      const markdown = `---
title: Rizom
description: The Rizom collective's knowledge hub
copyright: © 2025 Rizom
themeMode: dark
cta:
  heading: Unlock your full potential
  buttonText: Join Rizom
  buttonLink: https://www.linkedin.com/company/rizom-collective
---
`;

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

    it("should parse frontmatter format without CTA", () => {
      const markdown = `---
title: My Site
description: A simple website
---
`;

      const result = adapter.parseSiteInfoBody(markdown);

      expect(result.title).toBe("My Site");
      expect(result.description).toBe("A simple website");
      expect(result.cta).toBeUndefined();
    });

    it("should throw error for markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      expect(() => adapter.parseSiteInfoBody(markdown)).toThrow();
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseSiteInfoBody(markdown)).toThrow();
    });
  });

  describe("fromMarkdown", () => {
    it("should pass through frontmatter format", () => {
      const markdown = `---
title: My Site
description: A simple website
---
`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("site-info");
      expect(result.content).toContain("---");
      expect(result.content).toContain("title: My Site");
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
    it("should generate frontmatter string from entity", () => {
      const content = adapter.createSiteInfoContent({
        title: "Test",
        description: "A test site",
        themeMode: "dark",
      });

      const entity = createMockSiteInfo({ content });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toContain("title: Test");
      expect(result).toContain("description: A test site");
      expect(result).toContain("themeMode: dark");
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter from markdown", () => {
      const markdown = `---
title: Rizom
description: A knowledge hub
---
`;

      const result = adapter.parseFrontMatter(
        markdown,
        z.object({ title: z.string() }),
      );

      expect(result).toEqual({ title: "Rizom" });
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

      const content = adapter.createSiteInfoContent(originalData);
      const parsed = adapter.parseSiteInfoBody(content);

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

      const content = adapter.createSiteInfoContent(originalData);
      const parsed = adapter.parseSiteInfoBody(content);

      expect(parsed.title).toBe(originalData.title);
      expect(parsed.description).toBe(originalData.description);
      expect(parsed.cta).toBeUndefined();
    });
  });
});
