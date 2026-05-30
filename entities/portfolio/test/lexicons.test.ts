import { describe, expect, it } from "bun:test";

describe("project ATProto lexicons", () => {
  it("defines the ai.rizom.brain.project record", async () => {
    const lexicon = await Bun.file(
      "lexicons/ai.rizom.brain.project.json",
    ).json();

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
