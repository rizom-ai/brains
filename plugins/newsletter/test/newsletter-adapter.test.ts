import { describe, it, expect, beforeEach } from "bun:test";
import { NewsletterAdapter } from "../src/adapters/newsletter-adapter";
import type { Newsletter } from "../src/schemas/newsletter";
import { createTestEntity } from "@brains/test-utils";

function createMockNewsletter(overrides: Partial<Newsletter> = {}): Newsletter {
  return createTestEntity<Newsletter>("newsletter", {
    content: "Newsletter body content",
    metadata: {
      subject: "Test Newsletter",
      status: "draft",
    },
    ...overrides,
  });
}

describe("NewsletterAdapter", () => {
  let adapter: NewsletterAdapter;

  beforeEach(() => {
    adapter = new NewsletterAdapter();
  });

  describe("schema", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("newsletter");
    });

    it("should have a valid zod schema", () => {
      expect(adapter.schema).toBeDefined();
    });
  });

  describe("toMarkdown", () => {
    it("should serialize metadata as frontmatter with content as body", () => {
      const entity = createMockNewsletter({
        content: "Newsletter body content",
        metadata: {
          subject: "Weekly Update",
          status: "draft",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("subject: Weekly Update");
      expect(markdown).toContain("status: draft");
      expect(markdown).toContain("Newsletter body content");
    });

    it("should include optional metadata fields when present", () => {
      const entity = createMockNewsletter({
        content: "Body",
        metadata: {
          subject: "Test",
          status: "published",
          sentAt: "2024-01-15T10:00:00Z",
          buttondownId: "bd-123",
          entityIds: ["post-1", "post-2"],
          sourceEntityType: "post",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("sentAt: '2024-01-15T10:00:00Z'");
      expect(markdown).toContain("buttondownId: bd-123");
      expect(markdown).toContain("post-1");
      expect(markdown).toContain("post-2");
      expect(markdown).toContain("sourceEntityType: post");
    });

    it("should strip existing frontmatter from content before re-serializing", () => {
      const contentWithFrontmatter = `---
subject: Old Subject
status: draft
---

Body content`;

      const entity = createMockNewsletter({
        content: contentWithFrontmatter,
        metadata: {
          subject: "New Subject",
          status: "published",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("subject: New Subject");
      expect(markdown).toContain("status: published");
      expect(markdown).not.toContain("Old Subject");
      expect(markdown).toContain("Body content");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter into metadata", () => {
      const markdown = `---
subject: Parsed Newsletter
status: queued
---

Newsletter body`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("newsletter");
      expect(result.metadata?.subject).toBe("Parsed Newsletter");
      expect(result.metadata?.status).toBe("queued");
    });

    it("should parse optional metadata fields", () => {
      const markdown = `---
subject: Full Newsletter
status: published
sentAt: "2024-01-15T10:00:00Z"
buttondownId: bd-456
entityIds:
  - post-1
  - post-2
sourceEntityType: post
---

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.sentAt).toBe("2024-01-15T10:00:00Z");
      expect(result.metadata?.buttondownId).toBe("bd-456");
      expect(result.metadata?.entityIds).toEqual(["post-1", "post-2"]);
      expect(result.metadata?.sourceEntityType).toBe("post");
    });

    it("should store full markdown as content", () => {
      const markdown = `---
subject: Test
status: draft
---

Body here`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.content).toBe(markdown);
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockNewsletter({
        metadata: {
          subject: "Extracted",
          status: "published",
          sentAt: "2024-01-15T10:00:00Z",
        },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.subject).toBe("Extracted");
      expect(metadata.status).toBe("published");
      expect(metadata.sentAt).toBe("2024-01-15T10:00:00Z");
    });
  });

  describe("roundtrip", () => {
    it("should preserve data through toMarkdown -> fromMarkdown", () => {
      const entity = createMockNewsletter({
        content: "Original newsletter content",
        metadata: {
          subject: "Roundtrip Test",
          status: "draft",
          entityIds: ["post-1"],
          sourceEntityType: "post",
        },
      });

      const markdown = adapter.toMarkdown(entity);
      const parsed = adapter.fromMarkdown(markdown);

      expect(parsed.metadata?.subject).toBe("Roundtrip Test");
      expect(parsed.metadata?.status).toBe("draft");
      expect(parsed.metadata?.entityIds).toEqual(["post-1"]);
      expect(parsed.metadata?.sourceEntityType).toBe("post");
    });
  });
});
