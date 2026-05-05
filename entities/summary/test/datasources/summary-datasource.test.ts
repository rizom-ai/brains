import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { SummaryDataSource } from "../../src/datasources/summary-datasource";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
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
  decisions: [],
  actionItems: ["Create eval cases"],
};

describe("SummaryDataSource", () => {
  let datasource: SummaryDataSource;
  let entityService: IEntityService;
  let context: BaseDataSourceContext;
  const adapter = new SummaryAdapter();

  beforeEach(() => {
    entityService = createMockEntityService();
    context = { entityService };
    datasource = new SummaryDataSource(createSilentLogger());
  });

  it("fetches a single summary", async () => {
    const summary = createMockSummaryEntity({
      id: "conv-123",
      content: adapter.createContentBody([entry]),
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
    const getEntitySpy = spyOn(entityService, "getEntity").mockResolvedValue(
      summary,
    );

    const result = await datasource.fetch(
      { entityType: "summary", query: { conversationId: "conv-123" } },
      summaryDetailSchema,
      context,
    );

    expect(getEntitySpy).toHaveBeenCalledWith({
      entityType: "summary",
      id: "conv-123",
    });
    expect(result.conversationId).toBe("conv-123");
    expect(result.messageCount).toBe(2);
    expect(result.entries[0]?.title).toBe("Eval Plan");
  });

  it("fetches summary list data", async () => {
    const listEntitiesSpy = spyOn(
      entityService,
      "listEntities",
    ).mockResolvedValue([
      createMockSummaryEntity({ content: adapter.createContentBody([entry]) }),
    ]);

    const result = await datasource.fetch(
      { entityType: "summary", query: { limit: 10 } },
      summaryListSchema,
      context,
    );

    expect(listEntitiesSpy).toHaveBeenCalledWith({
      entityType: "summary",
      options: { limit: 10 },
    });
    expect(result.totalCount).toBe(1);
    expect(result.summaries[0]?.messageCount).toBe(2);
    expect(result.summaries[0]?.latestEntry).toBe("Eval Plan");
  });

  it("throws when requested summary is missing", () => {
    spyOn(entityService, "getEntity").mockResolvedValue(null);

    expect(
      datasource.fetch(
        { entityType: "summary", query: { id: "missing" } },
        summaryDetailSchema,
        context,
      ),
    ).rejects.toThrow("Summary not found: missing");
  });
});
