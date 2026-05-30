import { describe, expect, it } from "bun:test";

describe("social-post ATProto lexicons", () => {
  it("defines the ai.rizom.brain.socialPost record", async () => {
    const lexicon = await Bun.file(
      "lexicons/ai.rizom.brain.socialPost.json",
    ).json();

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
