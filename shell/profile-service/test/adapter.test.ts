import { describe, it, expect, beforeEach } from "bun:test";
import { ProfileAdapter } from "../src/adapter";
import type { ProfileEntity } from "../src/schema";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";

describe("ProfileAdapter", () => {
  let adapter: ProfileAdapter;

  beforeEach(() => {
    adapter = new ProfileAdapter();
  });

  describe("schema", () => {
    it("should have valid profile schema", () => {
      const schema = adapter.schema;

      const validProfile = createTestEntity<ProfileEntity>("profile", {
        id: "profile",
        content: "",
      });

      expect(() => schema.parse(validProfile)).not.toThrow();
    });

    it("should reject invalid profile entity type", () => {
      const schema = adapter.schema;

      const base = createTestEntity("profile", {
        id: "profile",
        content: "",
      });
      const invalidProfile = {
        ...base,
        entityType: "other",
      };

      expect(() => schema.parse(invalidProfile)).toThrow();
    });

    it("should reject invalid profile ID", () => {
      const schema = adapter.schema;

      const base = createTestEntity("profile", {
        id: "wrong:id",
        content: "",
      });

      expect(() => schema.parse(base)).toThrow();
    });
  });

  describe("frontmatterSchema", () => {
    it("should expose frontmatterSchema for CMS", () => {
      expect(adapter.frontmatterSchema).toBeDefined();
      expect(adapter.frontmatterSchema.shape).toHaveProperty("name");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("description");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("socialLinks");
    });

    it("should be a singleton", () => {
      expect(adapter.isSingleton).toBe(true);
    });

    it("should have a body (story)", () => {
      expect(adapter.hasBody).toBe(true);
    });
  });

  describe("toMarkdown", () => {
    it("should convert profile entity to frontmatter format", () => {
      const content = adapter.createProfileContent({
        name: "Rizom",
        description: "Open-source collective building privacy-first tools",
        website: "https://rizom.ai",
        email: "contact@rizom.ai",
        socialLinks: [
          { platform: "github", url: "https://github.com/rizom-ai" },
          {
            platform: "linkedin",
            url: "https://linkedin.com/company/rizom-collective",
          },
        ],
      });

      const entity = createTestEntity<ProfileEntity>("profile", {
        id: "profile",
        content,
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("name: Rizom");
      expect(markdown).toContain("description:");
      expect(markdown).toContain("privacy-first tools");
      expect(markdown).toMatch(/website:.*https:\/\/rizom\.ai/);
      expect(markdown).toContain("email: contact@rizom.ai");
      expect(markdown).toContain("github");
      expect(markdown).toContain("linkedin");
    });

    it("should handle optional fields correctly", () => {
      const content = adapter.createProfileContent({
        name: "John Doe",
      });

      const entity = createTestEntity<ProfileEntity>("profile", {
        id: "profile",
        content,
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("name: John Doe");
    });
  });

  describe("parseProfileBody", () => {
    it("should parse frontmatter format to profile body", () => {
      const markdown = `---
name: Rizom
description: Open-source collective
website: https://rizom.ai
email: contact@rizom.ai
socialLinks:
  - platform: github
    url: https://github.com/rizom-ai
  - platform: linkedin
    url: https://linkedin.com/company/rizom-collective
---
`;

      const result = adapter.parseProfileBody(markdown);

      expect(result.name).toBe("Rizom");
      expect(result.description).toBe("Open-source collective");
      expect(result.website).toBe("https://rizom.ai");
      expect(result.email).toBe("contact@rizom.ai");
      expect(result.socialLinks).toHaveLength(2);
      expect(result.socialLinks?.[0]).toMatchObject({
        platform: "github",
        url: "https://github.com/rizom-ai",
      });
    });

    it("should parse legacy structured markdown to profile body", () => {
      const markdown = `# Profile

## Name
Rizom

## Description
Open-source collective building privacy-first tools

## Website
https://rizom.ai

## Email
contact@rizom.ai

## Social Links

### 1

#### Platform
github

#### URL
https://github.com/rizom-ai

### 2

#### Platform
linkedin

#### URL
https://linkedin.com/company/rizom-collective`;

      const result = adapter.parseProfileBody(markdown);

      expect(result.name).toBe("Rizom");
      expect(result.description).toBe(
        "Open-source collective building privacy-first tools",
      );
      expect(result.website).toBe("https://rizom.ai");
      expect(result.email).toBe("contact@rizom.ai");
      expect(result.socialLinks).toHaveLength(2);
      expect(result.socialLinks?.[0]).toMatchObject({
        platform: "github",
        url: "https://github.com/rizom-ai",
      });
    });

    it("should throw error for markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      expect(() => adapter.parseProfileBody(markdown)).toThrow();
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseProfileBody(markdown)).toThrow();
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter format", () => {
      const markdown = `---
name: Rizom
description: Open-source collective
---
`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("profile");
      expect(result.content).toContain("---");
      expect(result.content).toContain("name: Rizom");
    });

    it("should auto-convert legacy structured markdown to frontmatter", () => {
      const markdown = `# Profile

## Name
Rizom

## Description
Open-source collective building privacy-first tools`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("profile");
      expect(result.content).toContain("---");
      expect(result.content).toContain("name: Rizom");
    });
  });

  describe("extractMetadata", () => {
    it("should extract name, email, and website as metadata", () => {
      const content = adapter.createProfileContent({
        name: "Rizom",
        description: "Open-source collective",
        website: "https://rizom.ai",
        email: "contact@rizom.ai",
        socialLinks: [
          { platform: "github", url: "https://github.com/rizom-ai" },
        ],
      });

      const entity = createTestEntity<ProfileEntity>("profile", {
        id: "profile",
        content,
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        name: "Rizom",
        email: "contact@rizom.ai",
        website: "https://rizom.ai",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string from entity", () => {
      const content = adapter.createProfileContent({
        name: "Test",
        website: "https://test.com",
      });

      const entity = createTestEntity<ProfileEntity>("profile", {
        id: "profile",
        content,
      });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toContain("name: Test");
      expect(result).toMatch(/website:.*https:\/\/test\.com/);
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter from markdown", () => {
      const markdown = `---
name: Rizom
website: https://rizom.ai
---
`;

      const result = adapter.parseFrontMatter(
        markdown,
        z.object({ name: z.string() }),
      );

      expect(result).toEqual({ name: "Rizom" });
    });
  });

  describe("roundtrip conversion", () => {
    it("should preserve data through createProfileContent and parseProfileBody", () => {
      const originalData = {
        name: "Rizom",
        description: "Open-source collective building privacy-first tools",
        website: "https://rizom.ai",
        email: "contact@rizom.ai",
        socialLinks: [
          {
            platform: "github" as const,
            url: "https://github.com/rizom-ai",
            label: "GitHub",
          },
          {
            platform: "linkedin" as const,
            url: "https://linkedin.com/company/rizom-collective",
          },
        ],
      };

      const content = adapter.createProfileContent(originalData);
      const parsed = adapter.parseProfileBody(content);

      expect(parsed.name).toBe(originalData.name);
      expect(parsed.description).toBe(originalData.description);
      expect(parsed.website).toBe(originalData.website);
      expect(parsed.email).toBe(originalData.email);
      expect(parsed.socialLinks).toHaveLength(2);
      expect(parsed.socialLinks?.[0]).toMatchObject({
        platform: "github",
        url: "https://github.com/rizom-ai",
        label: "GitHub",
      });
    });

    it("should preserve data with only required fields", () => {
      const originalData = { name: "John Doe" };

      const content = adapter.createProfileContent(originalData);
      const parsed = adapter.parseProfileBody(content);

      expect(parsed.name).toBe(originalData.name);
    });
  });
});
