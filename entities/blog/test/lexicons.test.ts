import { describe, expect, it } from "bun:test";

describe("blog ATProto lexicons", () => {
  it("defines the ai.rizom.brain.post record", async () => {
    const lexicon = await Bun.file("lexicons/ai.rizom.brain.post.json").json();

    expect(lexicon).toMatchObject({
      lexicon: 1,
      id: "ai.rizom.brain.post",
      defs: {
        main: {
          type: "record",
          key: "tid",
          record: {
            required: ["title", "body", "createdAt"],
            properties: {
              coverImage: { type: "object" },
              sourceEntityType: { type: "string" },
              sourceEntityId: { type: "string" },
            },
          },
        },
      },
    });
  });
});
