import { describe, expect, it } from "bun:test";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { z } from "@brains/utils";
import type { OpportunityEntity } from "../src";
import { OpportunityFocusDataSource } from "../src/datasources/opportunity-focus-datasource";

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

function createContext(entities: OpportunityEntity[]): BaseDataSourceContext {
  const entityService = {
    listEntities: async () => entities,
  } as unknown as IEntityService;

  return { entityService };
}

const focusSchema = z.object({
  focus: z.array(
    z.object({
      id: z.string(),
      rationale: z.string(),
      disqualified: z.boolean(),
    }),
  ),
  suggestions: z.array(
    z.object({
      id: z.string(),
      suggestedState: z.enum(["active", "staged", "warm", "closed"]),
      reason: z.string(),
    }),
  ),
  totalCount: z.number(),
});

describe("OpportunityFocusDataSource", () => {
  it("returns focus items and state suggestions for open opportunities", async () => {
    const datasource = new OpportunityFocusDataSource();
    const result = await datasource.fetch(
      { entityType: "opportunity", query: { now: "2026-06-23" } },
      focusSchema,
      createContext([
        createOpportunity("closed", { state: "closed", integrity: 5 }),
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
        createOpportunity("third", {
          incomePotential: 3,
          organizationalBuild: 3,
          brainsDevelopment: 3,
          integrity: 2,
        }),
      ]),
    );

    expect(result.totalCount).toBe(3);
    expect(result.focus.map((item) => item.id)).toEqual(["first", "second"]);
    expect(
      result.suggestions
        .filter((item) => item.suggestedState === "active")
        .map((item) => item.id),
    ).toEqual(["first", "second"]);
    expect(
      result.suggestions.find((item) => item.id === "third")?.suggestedState,
    ).toBe("staged");
  });

  it("skips integrity-0 opportunities in focus but still returns a suggestion", async () => {
    const datasource = new OpportunityFocusDataSource();
    const result = await datasource.fetch(
      { entityType: "opportunity" },
      focusSchema,
      createContext([
        createOpportunity("misaligned", {
          incomePotential: 5,
          organizationalBuild: 5,
          brainsDevelopment: 5,
          integrity: 0,
        }),
        createOpportunity("eligible", { integrity: 1 }),
      ]),
    );

    expect(result.focus.map((item) => item.id)).toEqual(["eligible"]);
    expect(
      result.suggestions.find((item) => item.id === "misaligned")
        ?.suggestedState,
    ).not.toBe("active");
  });
});
