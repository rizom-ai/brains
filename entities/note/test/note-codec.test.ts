import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import type { EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import notes from "../src";
import { createNoteContent } from "../src/lib/note-content";
import type { Note } from "../src/schemas/note";
import { noteSchema } from "../src/schemas/note";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

let harness: ReturnType<typeof createPluginHarness>;
let adapter: EntityAdapter<BaseEntity>;

beforeAll(async () => {
  harness = createPluginHarness({ logger: createSilentLogger("note-codec") });
  const plugins = instantiatePluginPackageDefinition(
    notes,
    {},
    { name: "@brains/note", version: "0.1.0" },
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);
  adapter = harness.getEntityRegistry().getAdapter("note");
});

afterAll(async () => {
  await harness.reset();
});

/** The entity a stored file decodes to, as the registry would build it. */
function decoded(markdown: string): Note {
  const parsed = adapter.fromMarkdown(markdown);
  // The registry's adapter is typed to BaseEntity, so the note's own schema is
  // what proves the decoded record is a note.
  return noteSchema.parse({
    id: "note-1",
    entityType: "note",
    content: parsed.content,
    metadata: parsed.metadata,
    visibility: "public",
    contentHash: "hash",
    created: TIMESTAMP,
    updated: TIMESTAMP,
  });
}

describe("note title derivation", () => {
  it("takes the title from frontmatter when it is stored", () => {
    expect(
      decoded("---\ntitle: My Note Title\n---\n\nContent").metadata,
    ).toEqual({ title: "My Note Title" });
  });

  it("falls back to the body's H1 when frontmatter has no title", () => {
    expect(decoded("# Note From H1\n\nContent").metadata.title).toBe(
      "Note From H1",
    );
    expect(
      decoded("---\nsomeOtherField: value\n---\n\n# Heading Title\n\nContent")
        .metadata.title,
    ).toBe("Heading Title");
  });

  it("uses the first nonempty body line, or Untitled for empty content", () => {
    expect(
      decoded("\n\nJust content, no heading.\nSecond line").metadata.title,
    ).toBe("Just content, no heading.");
    expect(decoded(" \n ").metadata.title).toBe("Untitled");
  });

  it("caps fallback titles at 80 Unicode characters without truncating authored titles", () => {
    const long = "🧠".repeat(90);
    expect(Array.from(decoded(long).metadata.title)).toHaveLength(80);
    expect(decoded(long).metadata.title).toBe("🧠".repeat(79) + "…");
    expect(decoded(`# ${long}`).metadata.title).toBe(long);
    expect(decoded(`---\ntitle: ${long}\n---\nBody`).metadata.title).toBe(long);
  });

  it("projects a default stored title from current source without mutating the record", () => {
    const entity = decoded("# Current title\n\nBody");
    entity.metadata.title = "Untitled";
    const before = structuredClone(entity);
    expect(adapter.displayTitle?.(entity)).toBe("Current title");
    expect(adapter.extractMetadata(entity)).toEqual(before.metadata);
    expect(entity).toEqual(before);
  });

  it.each([
    ["a".repeat(80), "a".repeat(80)],
    ["a".repeat(81), `${"a".repeat(79)}…`],
    [`${"word ".repeat(20)}ending`, `${"word ".repeat(15)}word…`],
    [`${"a".repeat(75)} longword`, `${"a".repeat(75)}…`],
    [`${"a".repeat(79)} next word`, `${"a".repeat(79)}…`],
    ["😀".repeat(81), `${"😀".repeat(79)}…`],
  ])(
    "bounds first-line fallbacks at word and Unicode boundaries: %s",
    (line, expected) => {
      const content = `---\nstatus: generating\n---\n\n${line}\nSecond line`;
      expect(decoded(content).metadata.title).toBe(expected);
      const stored = {
        ...decoded(content),
        content,
        metadata: { title: "Untitled" },
      };
      const before = structuredClone(stored);
      expect(adapter.displayTitle?.(stored)).toBe(expected);
      expect(adapter.extractMetadata(stored)).toEqual(before.metadata);
      expect(stored).toEqual(before);
    },
  );

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
    "derives fallback titles from the body, not frontmatter: %s",
    (markdown, title) => {
      expect(decoded(markdown).metadata.title).toBe(title);
    },
  );

  it.each([
    ["\nFirst body line\nSecond line", "First body line"],
    ["---\nstatus: failed\n---\nFirst body line", "First body line"],
    ["---\ntitle: Untitled\n---\nFirst body line", "Untitled"],
    ["", "Untitled"],
  ])(
    "projects placeholder labels without rewriting source or status: %s",
    (content, title) => {
      const entity = {
        ...decoded(content),
        content,
        metadata: { title: "Untitled", status: "failed", error: "Keep this" },
      };
      const before = structuredClone(entity);
      expect(adapter.displayTitle?.(entity)).toBe(title);
      expect(adapter.extractMetadata(entity)).toEqual(before.metadata);
      expect(entity).toEqual(before);
    },
  );

  it("prefers a stored title over the body's H1", () => {
    expect(
      decoded("---\ntitle: Frontmatter Title\n---\n\n# H1 Title\n\nContent")
        .metadata.title,
    ).toBe("Frontmatter Title");
  });
});

describe("note round trips", () => {
  // The reason the codec is asymmetric: a note is markdown the user may have
  // written by hand, and storing a title the body already states would add a
  // frontmatter block to every plain note on disk.
  it("leaves a plain note plain", () => {
    const plain = "# Simple Note\n\nJust content, no frontmatter.";
    expect(adapter.toMarkdown(decoded(plain))).toBe(plain);
  });

  it("keeps a stored title stored", () => {
    const stored = "---\ntitle: My Note\n---\nContent here";
    const written = adapter.toMarkdown(decoded(stored));
    expect(written).toContain("title: My Note");
    expect(written).toContain("Content here");
  });

  it("keeps generation status and error, which no body could restate", () => {
    const failed = "---\nstatus: failed\nerror: Generation failed\n---\nBody";
    const written = adapter.toMarkdown(decoded(failed));
    expect(written).toContain("status: failed");
    expect(written).toContain("error: Generation failed");
    expect(written).toContain("Body");
  });

  it("writes the placeholder it builds without duplicating its frontmatter", () => {
    const stub = adapter.buildStub?.({ id: "pending", title: "Pending" });
    if (!stub) throw new Error("Expected the note adapter to build a stub");
    const written = adapter.toMarkdown(
      adapter.schema.parse({
        id: "pending",
        entityType: "note",
        content: stub.content,
        metadata: stub.metadata,
        visibility: "public",
        contentHash: "hash",
        created: TIMESTAMP,
        updated: TIMESTAMP,
      }),
    );
    expect(written.match(/^---$/gmu)).toHaveLength(2);
    expect(written).toContain("status: generating");
  });
});

describe("createNoteContent", () => {
  it("stores content without frontmatter exactly as written", () => {
    expect(createNoteContent("New Title", "This is the body content.")).toBe(
      "This is the body content.",
    );
  });

  it("adds a title to existing frontmatter, keeping every other field", () => {
    const written = createNoteContent(
      "My Title",
      "---\ntags:\n  - test\n---\n\nBody content",
    );
    expect(written).toContain("title: My Title");
    expect(written).toContain("- test");
    expect(written).toContain("Body content");
  });

  it("never overrides a title the content already carries", () => {
    const written = createNoteContent(
      "Override",
      "---\ntitle: Original\n---\n\nBody",
    );
    expect(written).toContain("title: Original");
    expect(written).not.toContain("Override");
  });
});
