import { describe, expect, it } from "bun:test";

interface LexiconFile {
  lexicon: number;
  id: string;
  defs: {
    main: {
      type: string;
      key: string;
      record: {
        type: string;
        required?: string[];
        properties: Record<string, unknown>;
      };
    };
  };
}

async function readLexicon(filename: string): Promise<LexiconFile> {
  return (await Bun.file(`lexicons/${filename}`).json()) as LexiconFile;
}

describe("AT Protocol lexicons", () => {
  it("defines the brain card record", async () => {
    const lexicon = await readLexicon("ai.rizom.brain.card.json");

    expect(lexicon.lexicon).toBe(1);
    expect(lexicon.id).toBe("ai.rizom.brain.card");
    expect(lexicon.defs.main.type).toBe("record");
    expect(lexicon.defs.main.key).toBe("literal:self");
    expect(lexicon.defs.main.record.required).toEqual(["name", "createdAt"]);
    expect(lexicon.defs.main.record.properties["brainDid"]).toBeDefined();
    expect(lexicon.defs.main.record.properties["a2aEndpoint"]).toBeDefined();
  });

  it("defines the brain post record", async () => {
    const lexicon = await readLexicon("ai.rizom.brain.post.json");

    expect(lexicon.lexicon).toBe(1);
    expect(lexicon.id).toBe("ai.rizom.brain.post");
    expect(lexicon.defs.main.type).toBe("record");
    expect(lexicon.defs.main.key).toBe("tid");
    expect(lexicon.defs.main.record.required).toEqual([
      "title",
      "body",
      "createdAt",
    ]);
    expect(lexicon.defs.main.record.properties["canonicalUrl"]).toBeDefined();
    expect(lexicon.defs.main.record.properties["topics"]).toBeDefined();
    expect(
      lexicon.defs.main.record.properties["sourceEntityType"],
    ).toBeDefined();
    expect(lexicon.defs.main.record.properties["sourceEntityId"]).toBeDefined();
  });
});
