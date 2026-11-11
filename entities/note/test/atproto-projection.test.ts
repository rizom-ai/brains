import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { buildNoteAtprotoRecord } from "../src/atproto-projection";
import { notePlugin } from "./note-plugin";

// A note as a declared type reads it: its metadata and its body.
const note: Parameters<typeof buildNoteAtprotoRecord>[0]["entity"] = {
  id: "note-1",
  entityType: "note",
  content: "# Networked Knowledge\n\nA note body.",
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: { title: "Networked Knowledge", titleStated: true },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildNoteAtprotoRecord>[0]> = {},
): Parameters<typeof buildNoteAtprotoRecord>[0] {
  return {
    entity: note,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("note ATProto projection", () => {
  it("maps notes to ai.rizom.brain.note records", async () => {
    const record = await buildNoteAtprotoRecord(
      recordInput({ config: { brainDid: "did:web:brain.example.com" } }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.note",
      title: "Networked Knowledge",
      body: "# Networked Knowledge\n\nA note body.",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "note",
      sourceEntityId: "note-1",
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("uses shared frontmatter parsing for CRLF note markdown", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(notePlugin());
    // The runtime reads a CRLF document into its body.
    const read = harness
      .getEntityRegistry()
      .getAdapter("note")
      .fromMarkdown(
        "---\r\ntitle: Networked Knowledge\r\n---\r\n# Networked Knowledge\r\n\r\nA note body.",
      );

    const record = await buildNoteAtprotoRecord(
      recordInput({ entity: { ...note, content: read.content ?? "" } }),
    );

    expect(record.body).toBe("# Networked Knowledge\r\n\r\nA note body.");
  });

  it("names its page when the site gives the note one, and nothing otherwise", async () => {
    const placed = await buildNoteAtprotoRecord(
      recordInput({ pageUrl: "https://brain.example.com/notes/note-1" }),
    );
    expect(placed.canonicalUrl).toBe("https://brain.example.com/notes/note-1");
    const unplaced = await buildNoteAtprotoRecord(recordInput());
    expect(unplaced.canonicalUrl).toBeUndefined();
  });

  it("registers the note projection when the note plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-note-atproto" });
    await harness.installPlugin(notePlugin());

    const projection = harness
      .getMockShell()
      .getAtprotoProjectionRegistry()
      .get("note");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.note");
  });
});
