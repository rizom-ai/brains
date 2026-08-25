import { describe, it, expect } from "bun:test";
import { summaryDataSource } from "../../src/datasources/summary-datasource";
import { composeSummaryBody } from "../../src/lib/summary-body";
import { summaryListSchema } from "../../src/templates/summary-list/schema";
import { summaryDetailSchema } from "../../src/templates/summary-detail/schema";
import { createMockSummaryEntity } from "../fixtures/summary-entities";
import type { SummaryEntry } from "../../src/schemas/summary";

const entry: SummaryEntry = {
  title: "Eval Plan",
  summary: "The package needs plugin evals for summary quality.",
  timeRange: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T00:05:00.000Z",
  },
  sourceMessageCount: 2,
  keyPoints: [],
};

/**
 * The declared form is three pure functions — transform, list, detail — so
 * they are testable without a runtime around them. Finding the entities and
 * paging them is the runtime's half and is tested there.
 */
describe("summary data source", () => {
  const summary = createMockSummaryEntity({
    id: "conv-123",
    content: composeSummaryBody([entry]),
    metadata: {
      conversationId: "conv-123",
      channelName: "CLI",
      channelId: "cli",
      interfaceType: "cli",
      entryCount: 1,
      messageCount: 2,
      sourceHash: "hash",
      projectionVersion: 1,
      timeRange: entry.timeRange,
    },
  });

  it("parses the entries out of a summary once", () => {
    const transformed = summaryDataSource.transform(summary) as {
      conversationId: string;
      entries: SummaryEntry[];
      latestEntry: string;
    };

    expect(transformed.conversationId).toBe("conv-123");
    expect(transformed.entries[0]?.title).toBe("Eval Plan");
    expect(transformed.latestEntry).toBe("Eval Plan");
  });

  it("builds the list a reader scans", () => {
    const listed = summaryListSchema.parse(
      summaryDataSource.list([summaryDataSource.transform(summary)], null, {}),
    );

    expect(listed.totalCount).toBe(1);
    expect(listed.summaries[0]?.messageCount).toBe(2);
    expect(listed.summaries[0]?.latestEntry).toBe("Eval Plan");
    // The parsed entries are working state for the two views, not something
    // the list itself carries.
    expect(listed.summaries[0]).not.toHaveProperty("entries");
  });

  it("builds the detail a reader opens", async () => {
    const detail = summaryDetailSchema.parse(
      await summaryDataSource.detail?.({
        item: summaryDataSource.transform(summary),
        navigation: null,
        siblings: [],
        // This detail resolves nothing outside its own type.
        entities: {
          getEntity: async () => null,
          listEntities: async () => [],
          getEntityTypes: () => [],
          project: async () => ({
            origin: { kind: "centroid" as const },
            points: [],
            neighbors: [],
            distanceRange: { min: 0, max: 0 },
          }),
        },
      }),
    );

    expect(detail.conversationId).toBe("conv-123");
    expect(detail.messageCount).toBe(2);
    expect(detail.entries[0]?.title).toBe("Eval Plan");
  });

  it("falls back when a summary has no entries", () => {
    const empty = summaryDataSource.transform(
      createMockSummaryEntity({ content: composeSummaryBody([]) }),
    ) as { latestEntry: string; entryCount: number };

    expect(empty.latestEntry).toBe("No entries");
    expect(empty.entryCount).toBe(0);
  });
});
