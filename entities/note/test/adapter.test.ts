import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeAll } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { parseMarkdown } from "@brains/utils/markdown";
import { noteContent } from "../src/lib/note-markdown";
import { noteMetadataSchema, type Note } from "../src/schemas/note";
import { notePlugin } from "./note-plugin";

/** The body a declared note reads back as: its markdown without frontmatter. */
function bodyOf(markdown: string): string {
  return parseMarkdown(markdown).content;
}

function createMockNote(overrides: Partial<Note> = {}): Note {
  return createTestEntity<Note>("note", {
    content: "# Test Note\n\nContent here",
    metadata: { title: "Test Note" },
    ...overrides,
  });
}

/** The note's adapter, as the declared note registers it. */
describe("the note adapter", () => {
  let adapter: EntityAdapter<BaseEntity>;

  beforeAll(async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(notePlugin());
    adapter = harness.getEntityRegistry().getAdapter("note");
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
    it.each([
      ["a".repeat(80), "a".repeat(80)],
      ["a".repeat(81), `${"a".repeat(79)}…`],
      [`${"word ".repeat(20)}ending`, `${"word ".repeat(15)}word…`],
      [`${"a".repeat(75)} longword`, `${"a".repeat(75)}…`],
      [`${"a".repeat(79)} next word`, `${"a".repeat(79)}…`],
      ["😀".repeat(81), `${"😀".repeat(79)}…`],
    ])("caps only first-line fallbacks: %s", (line, expected) => {
      const content = `---\nstatus: generating\n---\n\n${line}\nSecond line`;
      const result = adapter.fromMarkdown(content);
      expect(result.metadata?.["title"]).toBe(expected);
      expect(
        Array.from(String(result.metadata?.["title"] ?? "")).length,
      ).toBeLessThanOrEqual(80);
      expect(result.content).toBe(bodyOf(content));
      // A stored placeholder title is labeled from the body, not rewritten.
      const stored = createMockNote({
        content: bodyOf(content),
        metadata: { title: "Untitled" },
      });
      expect(adapter.displayTitle?.(stored)).toBe(expected);
      expect(adapter.extractMetadata(stored)["title"]).toBe("Untitled");
      expect(stored.content).toBe(bodyOf(content));
    });

    it("preserves long authored titles and H1 headings", () => {
      const title = "Authored title ".repeat(10).trim();
      expect(
        adapter.fromMarkdown(`---\ntitle: ${title}\n---\nBody`).metadata?.[
          "title"
        ],
      ).toBe(title);
      expect(adapter.fromMarkdown(`# ${title}\nBody`).metadata?.["title"]).toBe(
        title,
      );
      expect(
        adapter.displayTitle?.(createMockNote({ metadata: { title } })),
      ).toBe(title);
    });

    it("should extract title from frontmatter", () => {
      const markdown = `---
title: My Note Title
---

Content here`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.content).toBe("Content here");
      expect(result.metadata?.["title"]).toBe("My Note Title");
      expect(result.metadata?.["titleStated"]).toBe(true);
    });

    it("should extract title from H1 when no frontmatter", () => {
      const markdown = `# Note From H1 Heading

Some content here`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.["title"]).toBe("Note From H1 Heading");
    });

    it("should extract title from H1 when frontmatter has no title", () => {
      const markdown = `---
someOtherField: value
---

# Heading Title

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.["title"]).toBe("Heading Title");
    });

    it.each([
      ["Just some content.\n\nMore content", "Just some content."],
      [
        "---\nstatus: generating\n# Not a body heading\n---\n\nFirst body line\nSecond line",
        "First body line",
      ],
      ["---\ntitle: ''\n---\n\nFirst body line", "First body line"],
      ["\n\n## A smaller heading\n\nBody", "A smaller heading"],
      ["---\ntitle: Untitled\n---\nAuthored title must win", "Untitled"],
      ["---\nstatus: generating\n---\n\n", "Untitled"],
      ["\n \n", "Untitled"],
    ])(
      "derives a body fallback without rewriting source: %s",
      (markdown, title) => {
        const result = adapter.fromMarkdown(markdown);

        expect(result.metadata?.["title"]).toBe(title);
        expect(result.content).toBe(bodyOf(markdown));
      },
    );

    it("should prefer frontmatter title over H1", () => {
      const markdown = `---
title: Frontmatter Title
---

# H1 Title

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.["title"]).toBe("Frontmatter Title");
    });
  });

  describe("toMarkdown", () => {
    it("should preserve frontmatter when present", () => {
      const content = `---
title: My Note
---

Content here`;

      const entity = createMockNote({
        content,
        metadata: { title: "My Note", titleStated: true },
      });
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

    it("should preserve status frontmatter when title is absent", () => {
      const content = `---
status: generating
---

Body content`;

      const entity = createMockNote({
        content,
        metadata: { title: "Untitled", status: "generating" },
      });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("status: generating");
      expect(markdown).toContain("Body content");
    });

    it("should preserve status and error frontmatter when title is absent", () => {
      const content = `---
status: failed
error: Generation failed
---

Body content`;

      const entity = createMockNote({
        content,
        metadata: {
          title: "Untitled",
          status: "failed",
          error: "Generation failed",
        },
      });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("status: failed");
      expect(markdown).toContain("error: Generation failed");
      expect(markdown).toContain("Body content");
    });
  });

  describe("extractMetadata", () => {
    it.each([
      ["\nFirst body line\nSecond line", "First body line"],
      ["---\nstatus: failed\n---\nFirst body line", "First body line"],
      ["---\ntitle: Untitled\n---\nFirst body line", "Untitled"],
      ["", "Untitled"],
    ])(
      "labels stored placeholder titles without mutating notes: %s",
      (content, title) => {
        const entity = createMockNote({
          content: bodyOf(content),
          metadata: {
            title: "Untitled",
            status: "failed",
            error: "Keep this",
            ...(content.includes("title: Untitled") && { titleStated: true }),
          },
        });
        const before = structuredClone(entity);
        expect(adapter.displayTitle?.(entity)).toBe(title);
        expect(adapter.extractMetadata(entity)).toEqual(before.metadata);
        expect(entity).toEqual(before);
      },
    );

    it("should return entity metadata", () => {
      const entity = createMockNote({
        metadata: { title: "Extracted Title" },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata["title"]).toBe("Extracted Title");
    });
  });

  describe("noteContent", () => {
    it("should return content as-is when it has no frontmatter", () => {
      const note = noteContent("New Note Title", "This is the body content.");

      expect(note).toEqual({
        content: "This is the body content.",
        title: "New Note Title",
        titleStated: false,
      });
    });

    it("should inject title into existing frontmatter", () => {
      const content = "---\ntags:\n  - test\n---\n\nBody content";
      const { content: markdown, titleStated } = noteContent(
        "My Title",
        content,
      );
      expect(titleStated).toBe(true);

      expect(markdown).toContain("title: My Title");
      expect(markdown).toContain("tags:");
      expect(markdown).toContain("- test");
      expect(markdown).toContain("Body content");
    });

    it("should preserve existing title in frontmatter", () => {
      const content = "---\ntitle: Original\n---\n\nBody";
      const { content: markdown, title } = noteContent("Override", content);
      expect(title).toBe("Original");

      expect(markdown).toContain("title: Original");
      expect(markdown).not.toContain("title: Override");
    });
  });

  describe("stated frontmatter", () => {
    it("should read a stated title as stated", () => {
      const content = `---
title: Parsed Title
---

Content`;

      expect(adapter.fromMarkdown(content).metadata).toEqual({
        title: "Parsed Title",
        titleStated: true,
      });
    });

    it("should state nothing when there is no frontmatter", () => {
      const content = `# Just a heading

No frontmatter here`;

      expect(adapter.fromMarkdown(content).metadata).toEqual({
        title: "Just a heading",
      });
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
        metadata: noteMetadataSchema.parse(
          parsed.metadata ?? { title: "Roundtrip Note" },
        ),
      });
      const output = adapter.toMarkdown(entity);

      expect(output).toContain("title: Roundtrip Note");
      expect(output).toContain("# Roundtrip Note");
      expect(output).toContain("This is the content.");
    });
  });
});
