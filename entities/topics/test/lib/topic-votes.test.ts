import { describe, expect, it } from "bun:test";
import {
  topicVoteResponseSchema,
  topicVoteSchema,
} from "../../src/schemas/votes";

const longTitle = "A deliberately long existing canonical topic title";

describe("topic vote contracts", () => {
  it("accepts existing titles verbatim even when longer than a new proposal", () => {
    expect(
      topicVoteResponseSchema.safeParse({
        sources: [
          {
            sourceKey: "note:source",
            supported: [{ title: longTitle, relevanceScore: 0.9 }],
            proposal: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      topicVoteSchema.safeParse({
        contentHash: "hash",
        visibility: "public",
        supported: [
          { slug: "existing", title: longTitle, relevanceScore: 0.9 },
        ],
        proposal: null,
      }).success,
    ).toBe(true);
  });

  it("validates new proposal titles, content and relevance at the AI boundary", () => {
    for (const proposal of [
      { title: longTitle, content: "Evidence", relevanceScore: 0.9 },
      { title: "Topic", content: "", relevanceScore: 0.9 },
      { title: "Topic", content: "Evidence", relevanceScore: 1.1 },
    ]) {
      expect(
        topicVoteResponseSchema.safeParse({
          sources: [{ sourceKey: "note:source", supported: [], proposal }],
        }).success,
      ).toBe(false);
    }
  });
});
