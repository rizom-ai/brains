import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("topic ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.topic record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.topic"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.topic",
      defs: {
        main: {
          type: "record",
          key: "tid",
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
