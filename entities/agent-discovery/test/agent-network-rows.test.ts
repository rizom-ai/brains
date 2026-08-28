import { describe, expect, it } from "bun:test";
import {
  buildSkillFilters,
  selectSkillFilterValues,
} from "../src/lib/agent-network-rows";
import type { AgentNetworkSkillRow } from "../src/lib/agent-network-schema";

function skill(
  id: string,
  tags: string[],
  sourceType: "brain" | "agent",
  sourceLabel: string,
): AgentNetworkSkillRow {
  return {
    id,
    name: id,
    tags,
    sourceLabel,
    sourceType,
  };
}

describe("buildSkillFilters", () => {
  it("declares every skill tag while ranking shared tags and gaps first", () => {
    const skills = [
      skill("brain-skill", ["knowledge", "identity"], "brain", "brain"),
      skill(
        "agent-a-skill",
        ["knowledge", "organization", "systems"],
        "agent",
        "Agent A",
      ),
      skill("agent-b-skill", ["systems", "ai-systems"], "agent", "Agent B"),
    ];

    const filters = buildSkillFilters(skills);

    expect(filters).toEqual([
      { tag: "knowledge", count: 2 },
      { tag: "systems", count: 2 },
      { tag: "identity", count: 1, variant: "gap" },
      { tag: "ai-systems", count: 1 },
      { tag: "organization", count: 1 },
    ]);

    const declarationCounts = new Map<string, number>();
    for (const { tag } of filters) {
      declarationCounts.set(tag, (declarationCounts.get(tag) ?? 0) + 1);
    }
    expect(
      skills
        .flatMap(({ tags }) => tags)
        .filter((tag) => declarationCounts.get(tag) !== 1),
    ).toEqual([]);
  });

  it("does not cap the canonical filter set at the legacy 50-option boundary", () => {
    const tags = Array.from(
      { length: 60 },
      (_, index) => `tag-${String(index + 1).padStart(2, "0")}`,
    );
    const skills = [
      skill("brain-a", tags.slice(0, 30), "brain", "brain"),
      skill("brain-b", tags.slice(30), "brain", "brain"),
      skill("agent", [tags[0] ?? "", tags[30] ?? ""], "agent", "Agent"),
    ];

    const filters = buildSkillFilters(skills);

    expect(filters).toHaveLength(60);
    expect(new Set(filters.map(({ tag }) => tag))).toEqual(new Set(tags));
  });
});

describe("selectSkillFilterValues", () => {
  it("keeps list filter values within the declared filter options", () => {
    expect(
      selectSkillFilterValues(
        ["architecture", "branding", "systems"],
        [
          { tag: "architecture", count: 2 },
          { tag: "systems", count: 1, variant: "gap" },
        ],
      ),
    ).toEqual(["architecture", "systems"]);
  });
});
