import { describe, expect, it } from "bun:test";

describe("note ATProto lexicons", () => {
  it("defines the ai.rizom.brain.note record", async () => {
    const lexicon = await Bun.file("lexicons/ai.rizom.brain.note.json").json();

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.note",
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
