import { describe, expect, it } from "bun:test";
import {
  tallyTopicVotes,
  chooseTopicChallenger,
  topicSoftCeiling,
} from "../../src/lib/topic-selection";
import { topicsPluginConfigSchema } from "../../src/schemas/config";
import type { TopicVote } from "../../src/schemas/votes";

const config = topicsPluginConfigSchema.parse({});
function vote(
  title: string,
  relevanceScore: number,
  proposal = false,
): TopicVote {
  return {
    revision: "revision",
    visibility: "public",
    supported: proposal
      ? []
      : [{ slug: title.toLowerCase(), title, relevanceScore }],
    proposal: proposal
      ? {
          slug: title.toLowerCase(),
          title,
          content: "Evidence",
          relevanceScore,
        }
      : null,
  };
}

describe("ranked topic selection", () => {
  it("sums role weight times relevance across both supports and proposals", () => {
    const tally = tallyTopicVotes(
      [
        { vote: vote("Architecture", 0.8), weight: 1, canMint: true },
        { vote: vote("Architecture", 0.9, true), weight: 0.8, canMint: true },
        { vote: vote("Ignored", 0.4, true), weight: 1, canMint: true },
      ],
      config,
    );
    expect(tally.get("architecture")?.support).toBeCloseTo(1.52);
    expect(tally.get("architecture")?.canEnter).toBe(true);
    expect(tally.has("ignored")).toBe(false);
  });

  it("does not double count the same slug from one source", () => {
    const sourceVote = vote("Architecture", 0.8);
    sourceVote.proposal = {
      slug: "architecture",
      title: "Architecture",
      content: "Evidence",
      relevanceScore: 0.9,
    };
    const tally = tallyTopicVotes(
      [{ vote: sourceVote, weight: 1, canMint: true }],
      config,
    );
    expect(tally.get("architecture")?.support).toBe(0.9);
  });

  it("admits the best qualified challenger below the cap", () => {
    const tally = tallyTopicVotes(
      [
        { vote: vote("Small", 0.8, true), weight: 1, canMint: true },
        { vote: vote("Best", 0.95, true), weight: 1, canMint: true },
        { vote: vote("Low", 0.6, true), weight: 1, canMint: true },
      ],
      config,
    );
    expect(chooseTopicChallenger([], tally, 5)?.candidate.slug).toBe("best");
    expect(chooseTopicChallenger([], tally, 5)?.replace).toBeUndefined();
    expect(tally.get("low")?.canEnter).toBe(false);
  });

  it("requires strictly more than a 25 percent lead at the cap", () => {
    const active = [{ id: "keep-id", slug: "existing", title: "Existing" }];
    const tally = tallyTopicVotes(
      [
        { vote: vote("Existing", 0.8), weight: 1, canMint: true },
        { vote: vote("Challenger", 1, true), weight: 1, canMint: true },
      ],
      config,
    );
    expect(chooseTopicChallenger(active, tally, 1)).toBeNull();
    const challenger = tally.get("challenger");
    if (!challenger) throw new Error("missing tally");
    challenger.support = 1.001;
    expect(chooseTopicChallenger(active, tally, 1)?.replace?.id).toBe(
      "keep-id",
    );
  });

  it("computes the cap from the full eligible corpus", () => {
    expect(topicSoftCeiling(1, 5)).toBe(5);
    expect(topicSoftCeiling(55, 5)).toBe(11);
    expect(topicSoftCeiling(10_000, 5)).toBe(24);
  });
});
