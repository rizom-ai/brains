import { describe, it, expect, beforeEach } from "bun:test";
import { DeckAdapter } from "../src/adapters/deck-adapter";
import { createMockDeckEntity } from "./fixtures/deck-entities";

describe("DeckAdapter", () => {
  let adapter: DeckAdapter;

  beforeEach(() => {
    adapter = new DeckAdapter();
  });

  describe("schema", () => {
    it("should have a valid zod schema", () => {
      const schema = adapter.schema;

      const validDeck = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Presentation",
        metadata: {
          slug: "test-presentation",
          title: "Test Presentation",
          status: "draft",
        },
      });

      expect(() => schema.parse(validDeck)).not.toThrow();
    });

    it("should reject invalid entity type", () => {
      const schema = adapter.schema;

      const invalidDeck = {
        id: "test-deck",
        entityType: "note", // Wrong type
        content: "# Slide 1\n\n---\n\n# Slide 2",
        contentHash: "abc",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: { slug: "test-deck", title: "Test Deck", status: "draft" },
      };

      expect(() => schema.parse(invalidDeck)).toThrow();
    });

    it("should reject published metadata without publishedAt", () => {
      const schema = adapter.schema;

      const invalidDeck = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Published Without Date",
        status: "published",
        metadata: {
          slug: "published-without-date",
          title: "Published Without Date",
          status: "published",
        },
      });

      expect(() => schema.parse(invalidDeck)).toThrow(
        "publishedAt is required when deck status is published",
      );
    });
  });

  describe("toMarkdown", () => {
    it("should generate markdown with frontmatter", () => {
      const entity = createMockDeckEntity({
        content: "# Welcome\n\nIntro slide\n\n---\n\n# Main Content",
        title: "Test Presentation",
        description: "A test presentation",
        author: "Jane Developer",
        status: "published",
        publishedAt: "2025-01-01T10:00:00.000Z",
        metadata: {
          slug: "test-deck",
          title: "Test Presentation",
          status: "published",
          publishedAt: "2025-01-01T10:00:00.000Z",
        },
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Presentation");
      expect(markdown).toContain("description: A test presentation");
      expect(markdown).toContain("author: Jane Developer");
      expect(markdown).toContain("status: published");
      expect(markdown).toContain("publishedAt: '2025-01-01T10:00:00.000Z'");
      expect(markdown).toContain("# Welcome");
      expect(markdown).toContain("# Main Content");
    });

    it("should throw error if content has no slide separators", () => {
      const entity = createMockDeckEntity({
        content: "# Just one slide without separators",
        title: "Invalid Deck",
      });

      expect(() => adapter.toMarkdown(entity)).toThrow(
        "Invalid deck: markdown must contain slide separators (---)",
      );
    });

    it("should include optional fields when present", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "Optional description",
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("description: Optional description");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse markdown with frontmatter", () => {
      const markdown = `---
title: Test Presentation
description: A test presentation
author: Jane Developer
status: published
publishedAt: '2025-01-01T10:00:00.000Z'
---

# Welcome

Intro slide

---

# Main Content

Key points`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("deck");
      expect(result.metadata?.title).toBe("Test Presentation");
      expect(result.metadata?.slug).toBe("test-presentation");
      expect(result.metadata?.publishedAt).toBe("2025-01-01T10:00:00.000Z");
      // Content is the full markdown (frontmatter is preserved for storage)
      expect(result.content).toContain("title: Test Presentation");
      expect(result.content).toContain("# Welcome");
    });

    it("should throw error if content has no slide separators", () => {
      const markdown = `---
title: Invalid Deck
status: draft
---

# Just one slide`;

      expect(() => adapter.fromMarkdown(markdown)).toThrow(
        "Invalid deck: markdown must contain slide separators (---)",
      );
    });

    it("should reject published decks without publishedAt", () => {
      const markdown = `---
title: Published Without Date
status: published
---

# Slide 1

---

# Slide 2`;

      expect(() => adapter.fromMarkdown(markdown)).toThrow(
        "publishedAt is required when deck status is published",
      );
    });

    it("should handle missing optional fields", () => {
      const markdown = `---
title: Minimal Deck
status: draft
---

# Slide 1

---

# Slide 2`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.title).toBe("Minimal Deck");
      expect(result.metadata?.status).toBe("draft");
    });
  });

  describe("extractMetadata", () => {
    it("should extract deck metadata", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        status: "published",
        publishedAt: "2025-01-01T10:00:00.000Z",
        metadata: {
          slug: "test-deck",
          title: "Test Deck",
          status: "published",
          publishedAt: "2025-01-01T10:00:00.000Z",
        },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.slug).toBe("test-deck");
      expect(metadata.title).toBe("Test Deck");
      expect(metadata.status).toBe("published");
      expect(metadata.publishedAt).toBe("2025-01-01T10:00:00.000Z");
    });

    it("should handle missing optional metadata", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.title).toBe("Test Deck");
      expect(metadata.publishedAt).toBeUndefined();
      expect(metadata.coverImageId).toBeUndefined();
    });
  });

  describe("generateTitle", () => {
    it("should return entity title from metadata", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "My Presentation",
      });

      const title = adapter.generateTitle(entity);

      expect(title).toBe("My Presentation");
    });
  });

  describe("generateSummary", () => {
    it("should return fallback summary", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
      });

      const summary = adapter.generateSummary(entity);

      expect(summary).toBe("Presentation: Test Deck");
    });
  });

  describe("slide validation", () => {
    it("should accept content with multiple slide separators", () => {
      const markdown = `---
title: Multi-slide Deck
status: draft
---

# Slide 1

---

# Slide 2

---

# Slide 3

---

# Slide 4`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("deck");
      expect(result.metadata?.title).toBe("Multi-slide Deck");
    });

    it("should validate slide separators as standalone lines", () => {
      const markdown = `---
title: Valid Deck
status: draft
---

# Slide 1

---

# Slide 2`;

      expect(() => adapter.fromMarkdown(markdown)).not.toThrow();
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter for entity", () => {
      const entity = createMockDeckEntity({
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "Test description",
      });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toContain("title: Test Deck");
      expect(result).toContain("description: Test description");
    });
  });
});
