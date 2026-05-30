import { describe, expect, it } from "bun:test";

describe("deck ATProto lexicons", () => {
  it("defines the ai.rizom.brain.deck record", async () => {
    const lexicon = await Bun.file("lexicons/ai.rizom.brain.deck.json").json();

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.deck",
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
