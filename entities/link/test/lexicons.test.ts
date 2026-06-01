import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("link ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.link record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.link"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.link",
      defs: {
        main: {
          type: "record",
          key: "tid",
          record: {
            required: ["title", "url", "createdAt"],
            properties: {
              source: { type: "object" },
              sourceEntityType: { type: "string" },
              sourceEntityId: { type: "string" },
            },
          },
        },
      },
    });
  });
});
