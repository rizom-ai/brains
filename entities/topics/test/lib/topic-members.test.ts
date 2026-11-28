import { describe, expect, it } from "bun:test";
import { answerTopicMembers } from "../../src/lib/topic-members";

const topic = (id: string, title: string): { id: string; title: string } => ({
  id,
  title,
});

function options(
  sourcesBySlug: Record<string, string[]>,
  topics = [topic("ethics", "Ethics"), topic("design", "Design")],
): Parameters<typeof answerTopicMembers>[1] {
  return {
    listTopics: async () => topics,
    readSources: async () => [{ key: "post:a", contentHash: "a1" }],
    sourcesBySlug: async () => new Map(Object.entries(sourcesBySlug)),
  };
}

describe("answerTopicMembers", () => {
  it("answers each asked topic with the sources supporting it", async () => {
    expect(
      await answerTopicMembers(
        {
          entityType: "topic",
          ids: ["ethics", "design"],
          visibilityScope: "public",
        },
        options({ ethics: ["post:a", "note:b:c"] }),
      ),
    ).toEqual({
      collections: [
        {
          id: "ethics",
          members: [
            { entityType: "post", id: "a" },
            // An id may hold a colon; the type is everything before the first.
            { entityType: "note", id: "b:c" },
          ],
        },
        { id: "design", members: [] },
      ],
    });
  });

  it("leaves out a topic the asker cannot see", async () => {
    expect(
      await answerTopicMembers(
        { entityType: "topic", ids: ["secret"], visibilityScope: "public" },
        options({ secret: ["post:a"] }),
      ),
    ).toEqual({ collections: [] });
  });

  it("answers nothing for a type it does not own", async () => {
    expect(
      await answerTopicMembers(
        { entityType: "series", ids: ["ethics"], visibilityScope: "public" },
        options({ ethics: ["post:a"] }),
      ),
    ).toEqual({ collections: [] });
  });
});
