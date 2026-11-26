import { describe, expect, it } from "bun:test";
import { bookAtproto, buildBookAtprotoRecord } from "../src/atproto-projection";

const entity: Parameters<typeof buildBookAtprotoRecord>[0]["entity"] = {
  id: "the-gay-science",
  entityType: "book",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  content: "## Contents\n\n1. Preface",
  metadata: { title: "The Gay Science" },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildBookAtprotoRecord>[0]> = {},
): Parameters<typeof buildBookAtprotoRecord>[0] {
  return {
    entity,
    config: {},
    dryRun: false,
    // A book's metadata indexes its title alone; the rest is in its file.
    storedDocument: async () =>
      [
        "---",
        "title: The Gay Science",
        "source: https://www.nietzschesource.org/#eKGWB/FW",
        "author: Friedrich Nietzsche",
        "year: 1882",
        "kind: work",
        "edition: eKGWB",
        "license: public-domain",
        "attribution: Digital critical edition, Nietzsche Source",
        "sections: 383",
        "---",
        "## Contents",
        "",
        "1. Preface",
      ].join("\n"),
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
      readBytes: async () => null,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("book ATProto projection", () => {
  it("maps a book to an ai.rizom.brain.book record that carries none of its text", async () => {
    const record = await buildBookAtprotoRecord(
      recordInput({
        config: { brainDid: "did:web:brain.example.com" },
        pageUrl: "https://brain.example.com/book/the-gay-science",
      }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.book",
      title: "The Gay Science",
      author: "Friedrich Nietzsche",
      year: 1882,
      kind: "work",
      edition: "eKGWB",
      license: "public-domain",
      attribution: "Digital critical edition, Nietzsche Source",
      source: "https://www.nietzschesource.org/#eKGWB/FW",
      canonicalUrl: "https://brain.example.com/book/the-gay-science",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "book",
      sourceEntityId: "the-gay-science",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
    expect(JSON.stringify(record)).not.toContain("Contents");
  });

  it("leaves out what the book's file does not state", async () => {
    const record = await buildBookAtprotoRecord(
      recordInput({
        storedDocument: async () =>
          "---\ntitle: The Gay Science\nsource: https://example.org/fw\n---\n",
      }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.book",
      title: "The Gay Science",
      source: "https://example.org/fw",
      sourceEntityType: "book",
      sourceEntityId: "the-gay-science",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("publishes under the canonical book lexicon", () => {
    expect(bookAtproto.lexicon.id).toBe("ai.rizom.brain.book");
  });
});
