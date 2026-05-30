import { describe, expect, it } from "bun:test";

describe("topic ATProto lexicons", () => {
  it("defines the ai.rizom.brain.topic record", async () => {
    const lexicon = await Bun.file("lexicons/ai.rizom.brain.topic.json").json();

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
