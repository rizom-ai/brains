import { describe, expect, it } from "bun:test";

describe("link ATProto lexicons", () => {
  it("defines the ai.rizom.brain.link record", async () => {
    const lexicon = await Bun.file("lexicons/ai.rizom.brain.link.json").json();

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
