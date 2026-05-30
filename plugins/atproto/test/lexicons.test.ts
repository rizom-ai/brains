import { describe, expect, it } from "bun:test";

interface LexiconPrimitiveProperty {
  type: "string" | "integer" | "boolean" | "bytes" | "blob";
  format?: string;
  maxLength?: number;
  knownValues?: string[];
}

interface LexiconArrayProperty {
  type: "array";
  items:
    | LexiconPrimitiveProperty
    | LexiconArrayProperty
    | LexiconObjectProperty;
  maxLength?: number;
}

interface LexiconObjectProperty {
  type: "object";
  required?: string[];
  properties: Record<
    string,
    LexiconPrimitiveProperty | LexiconArrayProperty | LexiconObjectProperty
  >;
}

interface LexiconFile {
  lexicon: 1;
  id: string;
  defs: {
    main: {
      type: "record";
      key: string;
      record: LexiconObjectProperty;
    };
  };
}

async function readLexicon(filename: string): Promise<LexiconFile> {
  return (await Bun.file(`lexicons/${filename}`).json()) as LexiconFile;
}

function recordProperties(
  lexicon: LexiconFile,
): LexiconObjectProperty["properties"] {
  return lexicon.defs.main.record.properties;
}

describe("AT Protocol lexicons", () => {
  it("defines the brain card record", async () => {
    const lexicon = await readLexicon("ai.rizom.brain.card.json");
    const properties = recordProperties(lexicon);

    expect(lexicon.lexicon).toBe(1);
    expect(lexicon.id).toBe("ai.rizom.brain.card");
    expect(lexicon.defs.main.type).toBe("record");
    expect(lexicon.defs.main.key).toBe("literal:self");
    expect(lexicon.defs.main.record.required).toEqual(["name", "createdAt"]);
    expect(properties["brainDid"]).toBeDefined();
    expect(properties["a2aEndpoint"]).toBeDefined();
  });
});
