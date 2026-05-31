import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createNoteAtprotoProjection } from "../src/atproto-projection";
import { NotePlugin } from "../src/plugin";
import type { Note } from "../src/schemas/note";

const note: Note = {
  id: "note-1",
  entityType: "base",
  content:
    "---\ntitle: Networked Knowledge\n---\n# Networked Knowledge\n\nA note body.",
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: { title: "Networked Knowledge" },
};

describe("note ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps notes to ai.rizom.brain.note records", async () => {
    const projection = createNoteAtprotoProjection();

    const record = await projection.buildRecord({
      entity: note,
      context: createPluginHarness().getServiceContext("note"),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.note",
      title: "Networked Knowledge",
      body: "# Networked Knowledge\n\nA note body.",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "base",
      sourceEntityId: "note-1",
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("uses shared frontmatter parsing for CRLF note markdown", async () => {
    const projection = createNoteAtprotoProjection();

    const record = await projection.buildRecord({
      entity: {
        ...note,
        content:
          "---\r\ntitle: Networked Knowledge\r\n---\r\n# Networked Knowledge\r\n\r\nA note body.",
      },
      context: createPluginHarness().getServiceContext("note"),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
      },
    });

    expect(record.body).toBe("# Networked Knowledge\r\n\r\nA note body.");
  });

  it("registers the note projection when the note plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-note-atproto" });
    await harness.installPlugin(new NotePlugin({}));

    const projection = AtprotoProjectionRegistry.getInstance().get("base");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.note");
  });
});
