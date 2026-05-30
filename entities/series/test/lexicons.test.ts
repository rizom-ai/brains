import { describe, expect, it } from "bun:test";

describe("series ATProto lexicons", () => {
  it("defines the ai.rizom.brain.series record", async () => {
    const lexicon = await Bun.file(
      "lexicons/ai.rizom.brain.series.json",
    ).json();

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
