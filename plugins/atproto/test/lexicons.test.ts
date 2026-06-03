import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("AT Protocol lexicons", () => {
  it("uses the canonical brain card record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.card"];
    const properties = lexicon.defs.main.record.properties;

    expect(lexicon.lexicon).toBe(1);
    expect(lexicon.id).toBe("ai.rizom.brain.card");
    expect(lexicon.defs.main.type).toBe("record");
    expect(lexicon.defs.main.key).toBe("literal:self");
    expect(lexicon.defs.main.record.required).toEqual([
      "name",
      "description",
      "siteUrl",
      "skills",
      "model",
      "version",
      "brainDid",
      "anchorDid",
      "createdAt",
    ]);
    expect(properties["siteUrl"]).toBeDefined();
    expect(properties["skills"]).toBeDefined();
    expect(properties["brainDid"]).toBeDefined();
    expect(properties["anchorDid"]).toBeDefined();
    expect(properties["a2aEndpoint"]).toBeUndefined();
  });
});
