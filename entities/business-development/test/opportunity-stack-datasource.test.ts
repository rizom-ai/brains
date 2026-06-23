import { describe, expect, it } from "bun:test";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { z } from "@brains/utils";
import type { OpportunityEntity } from "../src";
import { OpportunityStackDataSource } from "../src/datasources/opportunity-stack-datasource";

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

const stackSchema = z.object({
  opportunities: z.array(
    z.object({
      id: z.string(),
      total: z.number(),
      disqualified: z.boolean(),
      state: z.string(),
    }),
  ),
  totalCount: z.number(),
});

describe("OpportunityStackDataSource", () => {
  it("returns a ranked stack of non-closed opportunities", async () => {
    const datasource = new OpportunityStackDataSource();
    const result = await datasource.fetch(
      { entityType: "opportunity", query: { now: "2026-06-23" } },
      stackSchema,
      createContext([
        createOpportunity("closed-high", {
          state: "closed",
          incomePotential: 5,
          organizationalBuild: 5,
          brainsDevelopment: 5,
          integrity: 5,
        }),
        createOpportunity("medium", {
          incomePotential: 3,
          organizationalBuild: 3,
          brainsDevelopment: 3,
          integrity: 3,
        }),
        createOpportunity("urgent", {
          hardDeadline: "2026-07-01",
          incomePotential: 3,
          organizationalBuild: 3,
          brainsDevelopment: 3,
          integrity: 3,
        }),
      ]),
    );

    expect(result.totalCount).toBe(2);
    expect(result.opportunities.map((item) => item.id)).toEqual([
      "urgent",
      "medium",
    ]);
  });

  it("can include closed opportunities when requested", async () => {
    const datasource = new OpportunityStackDataSource();
    const result = await datasource.fetch(
      {
        entityType: "opportunity",
        query: { includeClosed: true, now: "2026-06-23" },
      },
      stackSchema,
      createContext([
        createOpportunity("closed", { state: "closed" }),
        createOpportunity("warm", { state: "warm" }),
      ]),
    );

    expect(result.opportunities.map((item) => item.id)).toContain("closed");
    expect(result.totalCount).toBe(2);
  });

  it("applies the requested limit after ranking", async () => {
    const datasource = new OpportunityStackDataSource();
    const result = await datasource.fetch(
      { entityType: "opportunity", query: { limit: 1 } },
      stackSchema,
      createContext([
        createOpportunity("low", { integrity: 1 }),
        createOpportunity("high", { integrity: 5 }),
      ]),
    );

    expect(result.opportunities.map((item) => item.id)).toEqual(["high"]);
    expect(result.totalCount).toBe(2);
  });
});
