import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import type { EntityAdapter, Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import notes from "../src";
import { createNoteContent } from "../src/lib/note-content";
import type { Note } from "../src/schemas/note";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

let harness: ReturnType<typeof createPluginHarness>;
let adapter: EntityAdapter<Note>;

beforeAll(async () => {
  harness = createPluginHarness({ logger: createSilentLogger("note-codec") });
  const plugins = instantiatePluginPackageDefinition(
    notes,
    {},
    { name: "@brains/note", version: "0.1.0" },
  );
  for (const plugin of plugins as Plugin[]) await harness.installPlugin(plugin);
  adapter = harness.getEntityRegistry().getAdapter<Note>("note");
});

afterAll(() => {
  harness.reset();
});

/** The entity a stored file decodes to, as the registry would build it. */
function decoded(markdown: string): Note {
  const parsed = adapter.fromMarkdown(markdown);
  return adapter.schema.parse({
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

  it("falls back to Untitled when there is neither", () => {
    expect(decoded("Just content, no title anywhere.").metadata.title).toBe(
      "Untitled",
    );
  });

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
