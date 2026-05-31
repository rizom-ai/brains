import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("series ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.series record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.series"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.series",
      defs: {
        main: {
          type: "record",
          key: "tid",
          record: {
            required: ["title", "createdAt"],
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
