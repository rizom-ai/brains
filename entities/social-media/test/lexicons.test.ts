import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";

describe("social-post ATProto lexicons", () => {
  it("uses the canonical ai.rizom.brain.socialPost record", () => {
    const lexicon = canonicalAtprotoLexicons["ai.rizom.brain.socialPost"];

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.socialPost",
      defs: {
        main: {
          type: "record",
          key: "tid",
          record: {
            required: ["title", "platform", "body", "createdAt"],
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
