import { describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import {
  allSourcesRead,
  attributableAnswers,
  chooseChallenger,
  descriptionPrompt,
  earlierTopicIds,
  failedAttempts,
  isSameChoice,
  isVoteFresh,
  normalizeVote,
  strongestFirst,
  voteBatches,
  votePrompt,
  votePromptTitles,
  type SourceRef,
  type VoteLedger,
} from "../../src/lib/topic-extraction-decisions";
import type { ActiveTopic, TopicTally } from "../../src/lib/topic-selection";
import { topicsPluginConfigSchema } from "../../src/schemas/config";
import type {
  TopicProposal,
  TopicVote,
  TopicVoteResponse,
} from "../../src/schemas/votes";

type VoteAnswer = TopicVoteResponse["sources"][number];

const config = topicsPluginConfigSchema.parse({});

function ref(id: string, contentHash = `hash-${id}`): SourceRef {
  return { key: `note:${id}`, entityType: "note", id, contentHash };
}

function vote(
  contentHash: string,
  overrides: Partial<TopicVote> = {},
): TopicVote {
  return {
    contentHash,
    promptVersion: "prompt-1",
    visibility: "public",
    supported: [],
    proposal: null,
    ...overrides,
  };
}

function ledger(overrides: Partial<VoteLedger> = {}): VoteLedger {
  return {
    votes: new Map(),
    failures: new Map(),
    promptVersion: "prompt-1",
    visibility: "public",
    ...overrides,
  };
}

function topic(title: string, id = title.toLowerCase()): ActiveTopic {
  return { id, title, slug: title.toLowerCase() };
}

function tally(
  title: string,
  support: number,
  overrides: Partial<TopicTally> = {},
): TopicTally {
  return {
    slug: title.toLowerCase(),
    title,
    support,
    canEnter: true,
    proposals: [],
    ...overrides,
  };
}

function support(...entries: TopicTally[]): Map<string, TopicTally> {
  return new Map(entries.map((entry) => [entry.slug, entry]));
}

describe("vote freshness", () => {
  it("counts a vote only under the current content, prompt and visibility", () => {
    const source = ref("a");
    const fresh = (saved: TopicVote): boolean =>
      isVoteFresh(ledger({ votes: new Map([[source.key, saved]]) }), source);
    expect(fresh(vote("hash-a"))).toBe(true);
    expect(fresh(vote("edited"))).toBe(false);
    expect(fresh(vote("hash-a", { promptVersion: "prompt-0" }))).toBe(false);
    expect(fresh(vote("hash-a", { promptVersion: undefined }))).toBe(false);
    expect(fresh(vote("hash-a", { visibility: "shared" }))).toBe(false);
    expect(isVoteFresh(ledger(), source)).toBe(false);
  });
});

describe("failed attempts", () => {
  it("counts failures only for the content that failed", () => {
    const failures = new Map([
      ["note:a", { contentHash: "hash-a", attempts: 2 }],
    ]);
    expect(failedAttempts(failures, ref("a"))).toBe(2);
    expect(failedAttempts(failures, ref("a", "edited"))).toBe(0);
    expect(failedAttempts(failures, ref("b"))).toBe(0);
  });
});

describe("all sources read", () => {
  it("holds once every source has a fresh vote or a recorded failure", () => {
    const sources = [ref("a"), ref("b")];
    const votes = new Map([["note:a", vote("hash-a")]]);
    expect(allSourcesRead(ledger({ votes }), sources)).toBe(false);
    expect(
      allSourcesRead(
        ledger({
          votes,
          failures: new Map([
            ["note:b", { contentHash: "hash-b", attempts: 1 }],
          ]),
        }),
        sources,
      ),
    ).toBe(true);
    expect(allSourcesRead(ledger(), [])).toBe(true);
  });
});

describe("vote batches", () => {
  it("batches stale sources, retrying each previously failing source alone first", () => {
    const sources = ["a", "b", "c", "d", "e", "f"].map((id) => ref(id));
    const batches = voteBatches(
      ledger({
        votes: new Map([["note:a", vote("hash-a")]]),
        failures: new Map([["note:e", { contentHash: "hash-e", attempts: 1 }]]),
      }),
      sources,
      2,
    );
    expect(batches.map((batch) => batch.map(({ id }) => id))).toEqual([
      ["e"],
      ["b", "c"],
      ["d", "f"],
    ]);
  });
});

describe("earlier topics", () => {
  const active = [topic("One"), topic("Two")];

  it("keeps the earlier set chosen under the current prompt", () => {
    expect([
      ...earlierTopicIds(
        { promptVersion: "prompt-1", earlier: ["one"] },
        "prompt-1",
        active,
      ),
    ]).toEqual(["one"]);
  });

  it("marks every active topic earlier once the prompt changed", () => {
    expect([
      ...earlierTopicIds(
        { promptVersion: "prompt-0", earlier: [] },
        "prompt-1",
        active,
      ),
    ]).toEqual(["one", "two"]);
  });

  it("marks nothing earlier on a brain that never recorded a selection", () => {
    expect(earlierTopicIds(null, "prompt-1", active).size).toBe(0);
  });
});

describe("challenger choice", () => {
  it("never chooses a candidate whose id is already taken by a renamed topic", () => {
    const active = [topic("Renamed", "architecture")];
    expect(
      chooseChallenger(active, support(tally("Architecture", 3)), 5, {
        visibility: "public",
        allRead: true,
      }),
    ).toBeNull();
  });

  it("checks occupied ids in the extraction visibility's scope", () => {
    const active = [topic("Renamed", "architecture")];
    expect(
      chooseChallenger(active, support(tally("Architecture", 3)), 5, {
        visibility: "shared",
        allRead: true,
      })?.candidate.slug,
    ).toBe("architecture");
  });

  it("adds into a free slot even before every source is read", () => {
    expect(
      chooseChallenger([topic("One")], support(tally("Two", 1)), 5, {
        visibility: "public",
        allRead: false,
      }),
    ).toEqual({ candidate: tally("Two", 1) });
  });

  it("defers a replacement until every source is read", () => {
    const active = [topic("One"), topic("Two")];
    const tallies = support(
      tally("One", 1),
      tally("Two", 2),
      tally("Three", 5),
    );
    expect(
      chooseChallenger(active, tallies, 2, {
        visibility: "public",
        allRead: false,
      }),
    ).toBeNull();
    expect(
      chooseChallenger(active, tallies, 2, {
        visibility: "public",
        allRead: true,
      }),
    ).toEqual({ candidate: tally("Three", 5), replace: topic("One") });
  });

  it("does not mark the tally it is given", () => {
    const tallies = support(tally("Architecture", 3));
    chooseChallenger([topic("Renamed", "architecture")], tallies, 5, {
      visibility: "public",
      allRead: true,
    });
    expect(tallies.get("architecture")?.canEnter).toBe(true);
  });
});

describe("same choice", () => {
  const choice = {
    candidate: tally("Three", 5, {
      proposals: [
        {
          slug: "three",
          title: "Three",
          content: "Evidence",
          relevanceScore: 0.9,
        },
      ],
    }),
    replace: topic("One"),
  };

  it("holds for the same candidate, replacement and evidence", () => {
    expect(isSameChoice(structuredClone(choice), choice)).toBe(true);
  });

  it("fails when the candidate, replacement or evidence moved", () => {
    expect(isSameChoice(null, choice)).toBe(false);
    expect(
      isSameChoice({ ...choice, candidate: tally("Four", 5) }, choice),
    ).toBe(false);
    expect(isSameChoice({ ...choice, replace: topic("Two") }, choice)).toBe(
      false,
    );
    expect(isSameChoice({ candidate: choice.candidate }, choice)).toBe(false);
    expect(
      isSameChoice(
        { ...choice, candidate: { ...choice.candidate, proposals: [] } },
        choice,
      ),
    ).toBe(false);
  });
});

describe("strongest first", () => {
  it("orders topics by support, then by id", () => {
    const active = [
      topic("Weak"),
      topic("Beta"),
      topic("Strong"),
      topic("Alpha"),
    ];
    expect(
      strongestFirst(active, support(tally("Strong", 3), tally("Weak", 1))).map(
        ({ id }) => id,
      ),
    ).toEqual(["strong", "weak", "alpha", "beta"]);
  });
});

describe("vote prompt titles", () => {
  it("lists current topics not chosen earlier and the leading challengers, within the ceiling", () => {
    const active = [
      topic("Zeta"),
      topic("Legacy"),
      topic("Design and Craft"),
      topic("Alpha"),
    ];
    const titles = votePromptTitles(
      active,
      new Set(["legacy"]),
      support(
        tally("Alpha", 9),
        tally("Strong", 5),
        tally("Arts or Crafts", 4),
        tally("Middle", 3),
        tally("Weak", 1),
      ),
      2,
      config,
    );
    expect(titles).toEqual({
      current: ["Alpha", "Zeta"],
      challengers: ["Strong", "Middle"],
    });
  });
});

describe("description prompt", () => {
  it("quotes the strongest proposals, trimmed, or falls back to the title", () => {
    const proposal = (
      content: string,
      relevanceScore: number,
    ): TopicProposal => ({
      slug: "architecture",
      title: "Architecture",
      content,
      relevanceScore,
    });
    expect(
      descriptionPrompt(
        tally("Architecture", 3, {
          proposals: [
            proposal("weak", 0.6),
            proposal("b strong", 0.9),
            proposal("a strong", 0.9),
            ...Array.from({ length: 8 }, () => proposal("filler", 0.7)),
            proposal("x".repeat(2100), 0.95),
          ],
        }),
      ),
    ).toBe(
      `Topic: Architecture\n\nSupporting proposals:\n${[
        "x".repeat(2000),
        "a strong",
        "b strong",
        ...Array.from({ length: 5 }, () => "filler"),
      ].join("\n\n")}`,
    );
    expect(descriptionPrompt(tally("Architecture", 3))).toBe(
      "Topic: Architecture\n\nSupporting proposals:\nArchitecture",
    );
  });
});

describe("attributable answers", () => {
  it("keeps only answers given exactly once for a source in the batch", () => {
    const answer = (sourceKey: string): VoteAnswer => ({
      sourceKey,
      supported: [],
      proposal: null,
    });
    const batch = ["a", "b", "c"].map((id) => createTestEntity("note", { id }));
    const answers = attributableAnswers(batch, [
      answer("note:a"),
      answer("note:b"),
      answer("note:b"),
      answer("note:other"),
    ]);
    expect([...answers.keys()]).toEqual(["note:a"]);
  });
});

describe("vote normalization", () => {
  const source = createTestEntity("note", { id: "a", contentHash: "hash-a" });
  const result = (overrides: Partial<VoteAnswer>): VoteAnswer => ({
    sourceKey: "note:a",
    supported: [],
    proposal: null,
    ...overrides,
  });

  it("keeps listed, relevant supports once per slug at their highest relevance", () => {
    const normalized = normalizeVote(
      source,
      "prompt-1",
      result({
        supported: [
          { title: "Systems", relevanceScore: 0.6 },
          { title: "Architecture", relevanceScore: 0.9 },
          { title: "Unlisted", relevanceScore: 0.9 },
          { title: "Faint", relevanceScore: 0.2 },
          { title: "Systems", relevanceScore: 0.8 },
        ],
      }),
      new Set(["Architecture", "Systems", "Faint"]),
      true,
      config,
    );
    expect(normalized).toEqual({
      contentHash: "hash-a",
      promptVersion: "prompt-1",
      visibility: "public",
      supported: [
        { slug: "architecture", title: "Architecture", relevanceScore: 0.9 },
        { slug: "systems", title: "Systems", relevanceScore: 0.8 },
      ],
      proposal: null,
    });
  });

  it("keeps a relevant proposal only from a source that can mint", () => {
    const proposal = {
      title: "Architecture",
      content: "Evidence",
      relevanceScore: 0.9,
    };
    const normalize = (
      canMint: boolean,
      relevanceScore = 0.9,
    ): TopicVote["proposal"] =>
      normalizeVote(
        source,
        "prompt-1",
        result({ proposal: { ...proposal, relevanceScore } }),
        new Set(),
        canMint,
        config,
      ).proposal;
    expect(normalize(true)).toEqual({ ...proposal, slug: "architecture" });
    expect(normalize(false)).toBeNull();
    expect(normalize(true, 0.2)).toBeNull();
  });
});

describe("vote prompt", () => {
  it("lists the titles, then each source under its key", () => {
    const source = createTestEntity("note", {
      id: "a",
      content: "Body",
      metadata: { title: "A note" },
    });
    expect(votePrompt({ current: [], challengers: ["Strong"] }, [source])).toBe(
      "Current topics:\n(none)\n\nLeading challengers:\nStrong\n\n---\nSource key: note:a\nnote: A note\n\nBody",
    );
  });
});
