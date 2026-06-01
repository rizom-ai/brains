import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("deck ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.deck record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.deck"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.deck",
      defs: {
        main: {
          type: "record",
          key: "any",
          record: {
            required: ["title", "body", "createdAt"],
            properties: {
              sourceEntityType: { type: "string" },
              sourceEntityId: { type: "string" },
            },
          },
        },
      },
    });
  });
});
