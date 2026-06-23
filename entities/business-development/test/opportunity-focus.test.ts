import { describe, expect, it } from "bun:test";
import type { OpportunityEntity } from "../src";
import {
  buildOpportunityFocus,
  suggestOpportunityStates,
} from "../src/lib/opportunity-focus";
import { rankOpportunities } from "../src/lib/opportunity-ranking";

function createOpportunity(
  id: string,
  overrides: Partial<OpportunityEntity["metadata"]> = {},
): OpportunityEntity {
  const metadata: OpportunityEntity["metadata"] = {
    title: id,
    slug: id,
    type: "commercial",
    state: "warm",
    incomePotential: 1,
    organizationalBuild: 1,
    brainsDevelopment: 1,
    integrity: 1,
    ...overrides,
  };

  return {
    id,
    entityType: "opportunity",
    content: "",
    contentHash: "",
    created: "2026-06-01T00:00:00Z",
    updated: "2026-06-01T00:00:00Z",
    visibility: "restricted",
    metadata,
  };
}

describe("buildOpportunityFocus", () => {
  it("selects at most the top two eligible opportunities", () => {
    const ranked = rankOpportunities([
      createOpportunity("misaligned", {
        incomePotential: 5,
        organizationalBuild: 5,
        brainsDevelopment: 5,
        integrity: 0,
      }),
      createOpportunity("first", {
        incomePotential: 5,
        organizationalBuild: 4,
        brainsDevelopment: 4,
        integrity: 5,
      }),
      createOpportunity("second", {
        incomePotential: 4,
        organizationalBuild: 4,
        brainsDevelopment: 4,
        integrity: 4,
      }),
      createOpportunity("third", {
        incomePotential: 3,
        organizationalBuild: 3,
        brainsDevelopment: 3,
        integrity: 3,
      }),
    ]);

    expect(buildOpportunityFocus(ranked).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("returns a rationale for each focus item", () => {
    const ranked = rankOpportunities(
      [
        createOpportunity("deadline", {
          incomePotential: 3,
          organizationalBuild: 3,
          brainsDevelopment: 3,
          integrity: 3,
          hardDeadline: "2026-07-01",
        }),
      ],
      { now: "2026-06-23" },
    );

    const [item] = buildOpportunityFocus(ranked);

    expect(item?.rationale).toContain("score");
    expect(item?.rationale).toContain("deadline");
  });
});

describe("suggestOpportunityStates", () => {
  it("suggests active only for the top two eligible opportunities", () => {
    const ranked = rankOpportunities([
      createOpportunity("first", { integrity: 5 }),
      createOpportunity("second", { integrity: 4 }),
      createOpportunity("third", { integrity: 3 }),
    ]);

    const suggestions = suggestOpportunityStates(ranked);

    expect(
      suggestions
        .filter((item) => item.suggestedState === "active")
        .map((item) => item.id),
    ).toEqual(["first", "second"]);
  });

  it("suggests staged for non-active opportunities scoring at least 11", () => {
    const ranked = rankOpportunities([
      createOpportunity("first", {
        incomePotential: 5,
        organizationalBuild: 5,
        brainsDevelopment: 5,
        integrity: 5,
      }),
      createOpportunity("second", {
        incomePotential: 5,
        organizationalBuild: 4,
        brainsDevelopment: 4,
        integrity: 5,
      }),
      createOpportunity("staged", {
        incomePotential: 3,
        organizationalBuild: 3,
        brainsDevelopment: 3,
        integrity: 2,
      }),
    ]);

    expect(
      suggestOpportunityStates(ranked).find((item) => item.id === "staged")
        ?.suggestedState,
    ).toBe("staged");
  });

  it("suggests warm for non-active opportunities scoring below 11", () => {
    const ranked = rankOpportunities([
      createOpportunity("first", { integrity: 5 }),
      createOpportunity("second", { integrity: 4 }),
      createOpportunity("warm", {
        incomePotential: 1,
        organizationalBuild: 1,
        brainsDevelopment: 1,
        integrity: 1,
      }),
    ]);

    expect(
      suggestOpportunityStates(ranked).find((item) => item.id === "warm")
        ?.suggestedState,
    ).toBe("warm");
  });

  it("never suggests active for integrity-0 opportunities", () => {
    const ranked = rankOpportunities([
      createOpportunity("misaligned", {
        incomePotential: 5,
        organizationalBuild: 5,
        brainsDevelopment: 5,
        integrity: 0,
      }),
      createOpportunity("eligible", { integrity: 1 }),
    ]);

    const suggestion = suggestOpportunityStates(ranked).find(
      (item) => item.id === "misaligned",
    );

    expect(suggestion?.suggestedState).not.toBe("active");
    expect(suggestion?.reason.toLowerCase()).toContain("integrity");
  });
});
