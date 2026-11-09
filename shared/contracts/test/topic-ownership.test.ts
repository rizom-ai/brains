import { describe, expect, it } from "bun:test";
import { ownTopicSources } from "../src";

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
