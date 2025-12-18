import { describe, it, expect, beforeEach } from "bun:test";
import { ProfileAdapter } from "../src/adapter";
import type { ProfileEntity } from "../src/schema";
import { z, computeContentHash } from "@brains/utils";

describe("ProfileAdapter", () => {
  let adapter: ProfileAdapter;

  beforeEach(() => {
    adapter = new ProfileAdapter();
  });

  describe("schema", () => {
    it("should have valid profile schema", () => {
      const schema = adapter.schema;
      const content = "";

      const validProfile = {
        id: "profile",
        entityType: "profile",
        content, // BaseEntity requires content field
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(validProfile)).not.toThrow();
    });

    it("should reject invalid profile entity type", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidProfile = {
        id: "profile",
        entityType: "other", // Wrong type
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(invalidProfile)).toThrow();
    });

    it("should reject invalid profile ID", () => {
      const schema = adapter.schema;
      const content = "";

      const invalidProfile = {
        id: "wrong:id", // Must be "profile"
        entityType: "profile",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      expect(() => schema.parse(invalidProfile)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert profile entity to structured markdown", () => {
      // Create profile content
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

      const entity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      const markdown = adapter.toMarkdown(entity);

      // Should contain structured content
      expect(markdown).toContain("# Profile");
      expect(markdown).toContain("## Name");
      expect(markdown).toContain("Rizom");
      expect(markdown).toContain("## Description");
      expect(markdown).toContain("privacy-first tools");
      expect(markdown).toContain("## Website");
      expect(markdown).toContain("https://rizom.ai");
      expect(markdown).toContain("## Email");
      expect(markdown).toContain("contact@rizom.ai");
      expect(markdown).toContain("## Social Links");
      expect(markdown).toContain("github");
      expect(markdown).toContain("linkedin");
    });

    it("should handle optional fields correctly", () => {
      // Create profile with only required fields
      const content = adapter.createProfileContent({
        name: "John Doe",
      });

      const entity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      const markdown = adapter.toMarkdown(entity);

      // Should contain name
      expect(markdown).toContain("# Profile");
      expect(markdown).toContain("## Name");
      expect(markdown).toContain("John Doe");

      // StructuredContentFormatter includes all field headers even when optional
      // This is expected behavior - it creates a consistent structure
      expect(markdown).toContain("## Description");
      expect(markdown).toContain("## Website");
      expect(markdown).toContain("## Email");
      expect(markdown).toContain("## Social Links");
    });
  });

  describe("parseProfileBody", () => {
    it("should parse structured markdown to profile body", () => {
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
      expect(result.socialLinks?.[1]).toMatchObject({
        platform: "linkedin",
        url: "https://linkedin.com/company/rizom-collective",
      });
    });

    it("should parse profile with only required fields", () => {
      const markdown = `# Profile

## Name
John Doe`;

      const result = adapter.parseProfileBody(markdown);

      expect(result.name).toBe("John Doe");
      // When field headers are completely missing from markdown, returns undefined
      expect(result.description).toBeUndefined();
      expect(result.website).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.socialLinks).toBeUndefined();
    });

    it("should throw error for markdown without proper structure", () => {
      const markdown = "Some random text without structure";

      expect(() => adapter.parseProfileBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });

    it("should throw error for empty markdown", () => {
      const markdown = "";

      expect(() => adapter.parseProfileBody(markdown)).toThrow(
        "Failed to parse structured content",
      );
    });
  });

  describe("fromMarkdown", () => {
    it("should create partial entity from markdown", () => {
      const markdown = `# Profile

## Name
Rizom

## Description
Open-source collective building privacy-first tools`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("profile");
      expect(result.content).toBe(markdown);
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

      const entity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      const metadata = adapter.extractMetadata(entity);

      expect(metadata).toEqual({
        name: "Rizom",
        email: "contact@rizom.ai",
        website: "https://rizom.ai",
      });
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string (profile uses structured content, not frontmatter)", () => {
      const entity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: "",
        contentHash: computeContentHash(""),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      const result = adapter.generateFrontMatter(entity);

      expect(result).toBe("");
    });
  });

  describe("parseFrontMatter", () => {
    it("should return empty object (profile doesn't use frontmatter)", () => {
      const markdown = `---
name: Rizom
---

Content`;

      const result = adapter.parseFrontMatter(markdown, z.object({}));

      expect(result).toEqual({});
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

      // Create content
      const content = adapter.createProfileContent(originalData);

      // Parse it back
      const parsed = adapter.parseProfileBody(content);

      // Should preserve all fields
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
      expect(parsed.socialLinks?.[1]).toMatchObject({
        platform: "linkedin",
        url: "https://linkedin.com/company/rizom-collective",
      });
    });

    it("should preserve data with only required fields", () => {
      const originalData = {
        name: "John Doe",
      };

      // Create content
      const content = adapter.createProfileContent(originalData);

      // Parse it back
      const parsed = adapter.parseProfileBody(content);

      // Should preserve name
      expect(parsed.name).toBe(originalData.name);
      // StructuredContentFormatter returns empty strings for optional fields
      expect(parsed.description).toBe("");
      expect(parsed.website).toBe("");
      expect(parsed.email).toBe("");
      // Empty array for optional array fields
      expect(parsed.socialLinks).toEqual([]);
    });
  });
});
