import { describe, expect, it } from "bun:test";
import type { OpportunityEntity } from "../src";
import {
  computeOpportunityScore,
  rankOpportunities,
} from "../src/lib/opportunity-ranking";

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

describe("computeOpportunityScore", () => {
  it("sums value dimensions plus weighted integrity", () => {
    const opportunity = createOpportunity("high-value", {
      incomePotential: 4,
      organizationalBuild: 5,
      brainsDevelopment: 3,
      integrity: 4,
    });

    expect(computeOpportunityScore(opportunity)).toEqual({
      valueScore: 12,
      integrityScore: 6,
      urgencyBump: 0,
      total: 18,
      disqualified: false,
    });
  });

  it("marks integrity-0 opportunities as disqualified", () => {
    const opportunity = createOpportunity("misaligned", {
      incomePotential: 5,
      organizationalBuild: 5,
      brainsDevelopment: 5,
      integrity: 0,
    });

    expect(computeOpportunityScore(opportunity).disqualified).toBe(true);
    expect(computeOpportunityScore(opportunity).total).toBe(15);
  });

  it("adds urgency for deadlines within 30 days", () => {
    const base = createOpportunity("deadline", {
      hardDeadline: "2026-07-23",
    });

    expect(
      computeOpportunityScore(base, { now: "2026-06-23" }).urgencyBump,
    ).toBe(3);
  });

  it("does not add urgency after the 30-day boundary", () => {
    const base = createOpportunity("later", {
      hardDeadline: "2026-07-24",
    });

    expect(
      computeOpportunityScore(base, { now: "2026-06-23" }).urgencyBump,
    ).toBe(0);
  });

  it("does not add urgency for past deadlines", () => {
    const base = createOpportunity("past", {
      hardDeadline: "2026-06-22",
    });

    expect(
      computeOpportunityScore(base, { now: "2026-06-23" }).urgencyBump,
    ).toBe(0);
  });
});

describe("rankOpportunities", () => {
  it("ranks eligible opportunities by total score before disqualified ones", () => {
    const opportunities = [
      createOpportunity("misaligned", {
        incomePotential: 5,
        organizationalBuild: 5,
        brainsDevelopment: 5,
        integrity: 0,
      }),
      createOpportunity("medium", {
        incomePotential: 3,
        organizationalBuild: 3,
        brainsDevelopment: 3,
        integrity: 3,
      }),
      createOpportunity("high", {
        incomePotential: 4,
        organizationalBuild: 4,
        brainsDevelopment: 4,
        integrity: 4,
      }),
    ];

    expect(rankOpportunities(opportunities).map((item) => item.id)).toEqual([
      "high",
      "medium",
      "misaligned",
    ]);
  });

  it("uses earlier deadlines as a deterministic tiebreaker", () => {
    const opportunities = [
      createOpportunity("later", { hardDeadline: "2026-07-15" }),
      createOpportunity("earlier", { hardDeadline: "2026-07-01" }),
    ];

    expect(
      rankOpportunities(opportunities, { now: "2026-06-23" }).map(
        (item) => item.id,
      ),
    ).toEqual(["earlier", "later"]);
  });
});
