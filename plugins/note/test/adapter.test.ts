import { describe, it, expect, beforeEach } from "bun:test";
import { NoteAdapter } from "../src/adapters/note-adapter";
import type { Note } from "../src/schemas/note";
import { computeContentHash } from "@brains/utils";

function createMockNote(overrides: Partial<Note> = {}): Note {
  const content = overrides.content ?? "# Test Note\n\nContent here";
  return {
    id: "test-note-1",
    entityType: "note",
    content,
    contentHash: computeContentHash(content),
    created: "2025-01-30T10:00:00.000Z",
    updated: "2025-01-30T10:00:00.000Z",
    metadata: {
      title: "Test Note",
    },
    ...overrides,
  };
}

describe("NoteAdapter", () => {
  let adapter: NoteAdapter;

  beforeEach(() => {
    adapter = new NoteAdapter();
  });

  describe("schema", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("note");
    });

    it("should have a valid zod schema", () => {
      expect(adapter.schema).toBeDefined();
    });
  });

  describe("fromMarkdown", () => {
    it("should extract title from frontmatter", () => {
      const markdown = `---
title: My Note Title
---

Content here`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("note");
      expect(result.content).toBe(markdown);
      expect(result.metadata?.title).toBe("My Note Title");
    });

    it("should extract title from H1 when no frontmatter", () => {
      const markdown = `# Note From H1 Heading

Some content here`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("note");
      expect(result.metadata?.title).toBe("Note From H1 Heading");
    });

    it("should extract title from H1 when frontmatter has no title", () => {
      const markdown = `---
someOtherField: value
---

# Heading Title

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.title).toBe("Heading Title");
    });

    it("should use 'Untitled' when no title or H1", () => {
      const markdown = `Just some content without any title or heading.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.title).toBe("Untitled");
    });

    it("should prefer frontmatter title over H1", () => {
      const markdown = `---
title: Frontmatter Title
---

# H1 Title

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.title).toBe("Frontmatter Title");
    });
  });

  describe("toMarkdown", () => {
    it("should preserve frontmatter when present", () => {
      const content = `---
title: My Note
---

Content here`;

      const entity = createMockNote({ content });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("title: My Note");
      expect(markdown).toContain("Content here");
    });

    it("should return content as-is when no frontmatter", () => {
      const content = `# Simple Note

Just content, no frontmatter.`;

      const entity = createMockNote({ content });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toBe(content);
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockNote({
        metadata: { title: "Extracted Title" },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.title).toBe("Extracted Title");
    });
  });

  describe("createNoteContent", () => {
    it("should create markdown with frontmatter", () => {
      const markdown = adapter.createNoteContent(
        "New Note Title",
        "This is the body content.",
      );

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: New Note Title");
      expect(markdown).toContain("This is the body content.");
    });
  });

  describe("parseNoteFrontmatter", () => {
    it("should parse frontmatter from entity", () => {
      const content = `---
title: Parsed Title
---

Content`;

      const entity = createMockNote({ content });
      const frontmatter = adapter.parseNoteFrontmatter(entity);

      expect(frontmatter.title).toBe("Parsed Title");
    });

    it("should return empty object when no frontmatter", () => {
      const content = `# Just a heading

No frontmatter here`;

      const entity = createMockNote({ content });
      const frontmatter = adapter.parseNoteFrontmatter(entity);

      expect(frontmatter).toEqual({});
    });
  });

  describe("roundtrip", () => {
    it("should preserve content through fromMarkdown -> toMarkdown", () => {
      const original = `---
title: Roundtrip Note
---

# Roundtrip Note

This is the content.`;

      const parsed = adapter.fromMarkdown(original);
      const entity = createMockNote({
        content: original,
        metadata: parsed.metadata ?? { title: "Roundtrip Note" },
      });
      const output = adapter.toMarkdown(entity);

      expect(output).toContain("title: Roundtrip Note");
      expect(output).toContain("# Roundtrip Note");
      expect(output).toContain("This is the content.");
    });
  });
});
