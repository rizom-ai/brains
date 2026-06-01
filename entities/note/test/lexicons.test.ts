import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("note ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.note record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.note"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.note",
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
