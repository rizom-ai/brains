import { describe, expect, it } from "bun:test";

type LexiconProperty =
  | LexiconPrimitiveProperty
  | LexiconArrayProperty
  | LexiconObjectProperty;

interface LexiconPrimitiveProperty {
  type: "string" | "integer" | "boolean" | "bytes" | "blob";
  format?: string;
  maxLength?: number;
  knownValues?: string[];
}

interface LexiconArrayProperty {
  type: "array";
  items: LexiconProperty;
  maxLength?: number;
}

interface LexiconObjectProperty {
  type: "object";
  required?: string[];
  properties: Record<string, LexiconProperty>;
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
): Record<string, LexiconProperty> {
  return lexicon.defs.main.record.properties;
}

function expectObjectProperty(
  property: LexiconProperty | undefined,
): LexiconObjectProperty {
  expect(property).toBeDefined();
  expect(property?.type).toBe("object");
  return property as LexiconObjectProperty;
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

  it("defines the brain post record", async () => {
    const lexicon = await readLexicon("ai.rizom.brain.post.json");
    const properties = recordProperties(lexicon);

    expect(lexicon.lexicon).toBe(1);
    expect(lexicon.id).toBe("ai.rizom.brain.post");
    expect(lexicon.defs.main.type).toBe("record");
    expect(lexicon.defs.main.key).toBe("tid");
    expect(lexicon.defs.main.record.required).toEqual([
      "title",
      "body",
      "createdAt",
    ]);
    expect(properties["canonicalUrl"]).toBeDefined();
    expect(properties["topics"]).toBeDefined();
    expect(properties["coverImage"]).toBeDefined();
    expect(properties["sourceEntityType"]).toBeDefined();
    expect(properties["sourceEntityId"]).toBeDefined();
  });

  it("defines cover image as a structured post property", async () => {
    const lexicon = await readLexicon("ai.rizom.brain.post.json");
    const coverImage = expectObjectProperty(
      recordProperties(lexicon)["coverImage"],
    );

    expect(coverImage.required).toEqual(["blob"]);
    expect(coverImage.properties["blob"]?.type).toBe("blob");
    expect(coverImage.properties["alt"]?.type).toBe("string");
    expect(coverImage.properties["width"]?.type).toBe("integer");
    expect(coverImage.properties["height"]?.type).toBe("integer");
  });
});
