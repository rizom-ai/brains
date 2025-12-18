import { describe, it, expect, beforeEach } from "bun:test";
import { DeckFormatter } from "../src/formatters/deck-formatter";
import { createMockDeckEntity } from "./fixtures/deck-entities";

describe("DeckFormatter", () => {
  let formatter: DeckFormatter;

  beforeEach(() => {
    formatter = new DeckFormatter();
  });

  describe("schema", () => {
    it("should have a valid zod schema", () => {
      const schema = formatter.schema;

      const validDeck = createMockDeckEntity({
        id: "test-deck",
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
      const schema = formatter.schema;

      const invalidDeck = {
        id: "test-deck",
        entityType: "note", // Wrong type
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Presentation",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: { slug: "test-deck", title: "Test Deck" },
      };

      expect(() => schema.parse(invalidDeck)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should generate markdown with frontmatter", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Welcome\n\nIntro slide\n\n---\n\n# Main Content",
        title: "Test Presentation",
        description: "A test presentation",
        author: "Jane Developer",
        status: "published",
        metadata: {
          slug: "test-deck",
          title: "Test Deck",
          status: "published",
        },
      });

      const markdown = formatter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Presentation");
      expect(markdown).toContain("description: A test presentation");
      expect(markdown).toContain("author: Jane Developer");
      expect(markdown).toContain("status: published");
      expect(markdown).toContain("# Welcome");
      expect(markdown).toContain("# Main Content");
    });

    it("should throw error if content has no slide separators", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Just one slide without separators",
        title: "Invalid Deck",
      });

      expect(() => formatter.toMarkdown(entity)).toThrow(
        "Invalid deck: markdown must contain slide separators (---)",
      );
    });

    it("should include optional fields when present", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "Optional description",
      });

      const markdown = formatter.toMarkdown(entity);

      expect(markdown).toContain("description: Optional description");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse markdown with frontmatter", () => {
      const markdown = `---
title: Test Presentation
description: A test presentation
author: Jane Developer
---

# Welcome

Intro slide

---

# Main Content

Key points`;

      const result = formatter.fromMarkdown(markdown);

      expect(result.entityType).toBe("deck");
      expect(result.title).toBe("Test Presentation");
      expect(result.description).toBe("A test presentation");
      expect(result.author).toBe("Jane Developer");
      expect(result.content).toContain("# Welcome");
      expect(result.content).toContain("# Main Content");
      expect(result.content).not.toContain("---\ntitle:");
    });

    it("should throw error if content has no slide separators", () => {
      const markdown = `---
title: Invalid Deck
---

# Just one slide`;

      expect(() => formatter.fromMarkdown(markdown)).toThrow(
        "Invalid deck: markdown must contain slide separators (---)",
      );
    });

    it("should handle missing optional fields", () => {
      const markdown = `---
title: Minimal Deck
---

# Slide 1

---

# Slide 2`;

      const result = formatter.fromMarkdown(markdown);

      expect(result.title).toBe("Minimal Deck");
      expect(result.description).toBeUndefined();
      expect(result.author).toBeUndefined();
      expect(result.status).toBe("draft"); // Default status
    });
  });

  describe("extractMetadata", () => {
    it("should extract deck metadata", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "Test description",
        author: "Test Author",
        status: "published",
        metadata: {
          slug: "test-deck",
          title: "Test Deck",
          status: "published",
        },
      });

      const metadata = formatter.extractMetadata(entity);

      // extractMetadata now returns entity.metadata (slug + title + status)
      expect(metadata["slug"]).toBe("test-deck");
      expect(metadata["title"]).toBe("Test Deck");
      expect(metadata["status"]).toBe("published");
    });

    it("should handle missing optional metadata", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
      });

      const metadata = formatter.extractMetadata(entity);

      expect(metadata["title"]).toBe("Test Deck");
      expect(metadata["description"]).toBeUndefined();
      expect(metadata["author"]).toBeUndefined();
    });
  });

  describe("generateTitle", () => {
    it("should return entity title", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "My Presentation",
      });

      const title = formatter.generateTitle(entity);

      expect(title).toBe("My Presentation");
    });
  });

  describe("generateSummary", () => {
    it("should return description when available", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "This is a test presentation",
      });

      const summary = formatter.generateSummary(entity);

      expect(summary).toBe("This is a test presentation");
    });

    it("should return fallback when no description", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
      });

      const summary = formatter.generateSummary(entity);

      expect(summary).toBe("Presentation: Test Deck");
    });
  });

  describe("slide validation", () => {
    it("should accept content with multiple slide separators", () => {
      const markdown = `---
title: Multi-slide Deck
---

# Slide 1

---

# Slide 2

---

# Slide 3

---

# Slide 4`;

      const result = formatter.fromMarkdown(markdown);

      expect(result.entityType).toBe("deck");
      expect(result.title).toBe("Multi-slide Deck");
    });

    it("should validate slide separators as standalone lines", () => {
      const markdown = `---
title: Valid Deck
---

# Slide 1

---

# Slide 2`;

      expect(() => formatter.fromMarkdown(markdown)).not.toThrow();
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter from markdown", () => {
      const markdown = `---
title: Test Deck
description: Test description
---

# Slide 1

---

# Slide 2`;

      const schema = formatter.schema.pick({
        title: true,
        description: true,
      });

      const result = formatter.parseFrontMatter(markdown, schema);

      expect(result.title).toBe("Test Deck");
      expect(result.description).toBe("Test description");
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter for entity", () => {
      const entity = createMockDeckEntity({
        id: "test-deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: "Test Deck",
        description: "Test description",
      });

      const result = formatter.generateFrontMatter(entity);

      expect(result).toContain("title: Test Deck");
      expect(result).toContain("description: Test description");
    });
  });
});
