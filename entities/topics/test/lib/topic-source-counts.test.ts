import { describe, expect, it } from "bun:test";
import { countTopicSources } from "../../src/lib/topic-source-counts";
import { topicsPluginConfigSchema } from "../../src/schemas/config";
import type { TopicVote } from "../../src/schemas/votes";

const config = topicsPluginConfigSchema.parse({});
const PROMPT = "prompt-v2";

function supporting(
  contentHash: string,
  ...topics: [title: string, relevanceScore: number][]
): TopicVote {
  return {
    contentHash,
    promptVersion: PROMPT,
    visibility: "public",
    supported: topics.map(([title, relevanceScore]) => ({
      slug: title.toLowerCase(),
      title,
      relevanceScore,
    })),
    proposal: null,
  };
}

function count(
  sources: { key: string; contentHash: string }[],
  votes: [string, TopicVote][],
  aliases: [string, string][] = [],
): { bySlug: Record<string, number>; unattributed: number } {
  const counts = countTopicSources({
    sources,
    votes: new Map(votes),
    aliases: new Map(aliases),
    promptVersion: PROMPT,
    config,
  });
  return {
    bySlug: Object.fromEntries(counts.bySlug),
    unattributed: counts.unattributed,
  };
}

describe("countTopicSources", () => {
  it("counts a source for each topic its fresh vote supports", () => {
    expect(
      count(
        [
          { key: "note:a", contentHash: "a1" },
          { key: "note:b", contentHash: "b1" },
        ],
        [
          ["note:a", supporting("a1", ["Ethics", 0.9], ["Design", 0.8])],
          ["note:b", supporting("b1", ["Ethics", 0.7])],
        ],
      ),
    ).toEqual({ bySlug: { ethics: 2, design: 1 }, unattributed: 0 });
  });

  it("counts a proposal like a supported topic", () => {
    const vote = supporting("a1");
    vote.proposal = {
      slug: "ethics",
      title: "Ethics",
      content: "Evidence",
      relevanceScore: 0.9,
    };
    expect(
      count([{ key: "note:a", contentHash: "a1" }], [["note:a", vote]]),
    ).toEqual({ bySlug: { ethics: 1 }, unattributed: 0 });
  });

  it("leaves a source whose content changed since its vote unattributed", () => {
    expect(
      count(
        [{ key: "note:a", contentHash: "a2" }],
        [["note:a", supporting("a1", ["Ethics", 0.9])]],
      ),
    ).toEqual({ bySlug: {}, unattributed: 1 });
  });

  it("leaves a source voted under an earlier prompt unattributed", () => {
    const vote = { ...supporting("a1", ["Ethics", 0.9]), promptVersion: "v1" };
    expect(
      count([{ key: "note:a", contentHash: "a1" }], [["note:a", vote]]),
    ).toEqual({ bySlug: {}, unattributed: 1 });
  });

  it("leaves a source voted under another extraction visibility unattributed", () => {
    const vote: TopicVote = {
      ...supporting("a1", ["Ethics", 0.9]),
      visibility: "shared",
    };
    expect(
      count([{ key: "note:a", contentHash: "a1" }], [["note:a", vote]]),
    ).toEqual({ bySlug: {}, unattributed: 1 });
  });

  it("leaves a source without a vote unattributed", () => {
    expect(count([{ key: "note:a", contentHash: "a1" }], [])).toEqual({
      bySlug: {},
      unattributed: 1,
    });
  });

  it("counts only the sources given, not every vote in the ledger", () => {
    expect(
      count(
        [{ key: "note:a", contentHash: "a1" }],
        [
          ["note:a", supporting("a1", ["Ethics", 0.9])],
          ["note:hidden", supporting("h1", ["Ethics", 0.9])],
        ],
      ),
    ).toEqual({ bySlug: { ethics: 1 }, unattributed: 0 });
  });

  it("counts an absorbed slug for the topic that absorbed it, once per source", () => {
    expect(
      count(
        [
          { key: "note:a", contentHash: "a1" },
          { key: "note:b", contentHash: "b1" },
        ],
        [
          ["note:a", supporting("a1", ["Morals", 0.9], ["Ethics", 0.8])],
          ["note:b", supporting("b1", ["Morals", 0.7])],
        ],
        [["morals", "ethics"]],
      ),
    ).toEqual({ bySlug: { ethics: 2 }, unattributed: 0 });
  });

  it("excludes support below the minimum relevance", () => {
    expect(
      count(
        [{ key: "note:a", contentHash: "a1" }],
        [
          [
            "note:a",
            supporting(
              "a1",
              ["Ethics", config.minRelevanceScore],
              ["Design", config.minRelevanceScore - 0.1],
            ),
          ],
        ],
      ),
    ).toEqual({ bySlug: { ethics: 1 }, unattributed: 0 });
  });

  it("does not count a read source that supports no topic as unattributed", () => {
    expect(
      count(
        [{ key: "note:a", contentHash: "a1" }],
        [["note:a", supporting("a1")]],
      ),
    ).toEqual({ bySlug: {}, unattributed: 0 });
  });
});
