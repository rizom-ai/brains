import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("project ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.project record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.project"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.project",
      defs: {
        main: {
          type: "record",
          key: "tid",
          record: {
            required: ["title", "body", "year", "createdAt"],
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
