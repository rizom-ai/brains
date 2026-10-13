import { describe, expect, it } from "bun:test";
import {
  duplicateTopics,
  ownTopicSources,
} from "../../src/lib/topic-ownership";

const near = (
  entityId: string,
  distance: number,
): { entityType: string; entityId: string; distance: number } => ({
  entityType: "book-section",
  entityId,
  distance,
});

describe("ownTopicSources", () => {
  it("gives each source to the topic it sits closest to", () => {
    const owners = ownTopicSources([
      { topicId: "will-to-power", sources: [near("a", 0.2), near("s", 0.3)] },
      { topicId: "eternal-recurrence", sources: [near("s", 0.25)] },
    ]);

    expect(owners.get("book-section:a")).toBe("will-to-power");
    expect(owners.get("book-section:s")).toBe("eternal-recurrence");
  });

  it("gives a source at equal distance to the earlier topic", () => {
    const owners = ownTopicSources([
      { topicId: "bildung", sources: [near("s", 0.2)] },
      { topicId: "cultural-education", sources: [near("s", 0.2)] },
    ]);

    expect(owners.get("book-section:s")).toBe("bildung");
  });
});

describe("duplicateTopics", () => {
  it("joins a topic that owns none of its sources to the one owning most", () => {
    expect(
      duplicateTopics([
        { topicId: "bildung", sources: [near("a", 0.1), near("b", 0.1)] },
        { topicId: "greek-agon", sources: [near("c", 0.1)] },
        {
          topicId: "cultural-formation",
          sources: [near("c", 0.12), near("a", 0.2), near("b", 0.3)],
        },
      ]),
    ).toEqual([{ topicId: "cultural-formation", into: "bildung" }]);
  });

  it("keeps a broad topic whose sources are spread over several topics", () => {
    expect(
      duplicateTopics([
        { topicId: "bildung", sources: [near("a", 0.1)] },
        { topicId: "greek-agon", sources: [near("b", 0.1)] },
        { topicId: "bad-conscience", sources: [near("c", 0.1)] },
        {
          topicId: "will-to-power",
          sources: [near("a", 0.2), near("b", 0.2), near("c", 0.2)],
        },
      ]),
    ).toEqual([]);
  });

  it("keeps a topic that owns one source", () => {
    expect(
      duplicateTopics([
        { topicId: "bildung", sources: [near("a", 0.1)] },
        {
          topicId: "cultural-formation",
          sources: [near("a", 0.2), near("b", 0.2)],
        },
      ]),
    ).toEqual([]);
  });

  it("keeps a topic that has no sources to judge by", () => {
    expect(
      duplicateTopics([
        { topicId: "bildung", sources: [near("a", 0.1)] },
        { topicId: "unembedded", sources: [] },
      ]),
    ).toEqual([]);
  });

  it("on a tie, joins the topic owning its closest source", () => {
    expect(
      duplicateTopics([
        { topicId: "bildung", sources: [near("a", 0.1)] },
        { topicId: "greek-agon", sources: [near("b", 0.1)] },
        {
          topicId: "cultural-formation",
          sources: [near("a", 0.3), near("b", 0.2)],
        },
      ]),
    ).toEqual([{ topicId: "cultural-formation", into: "greek-agon" }]);
  });
});
