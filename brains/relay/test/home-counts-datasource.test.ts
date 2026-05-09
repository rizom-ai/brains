import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { createMockEntityService, createTestEntity } from "@brains/test-utils";
import { RelayHomeCountsDataSource } from "../src/home-counts-datasource";
import {
  RELAY_HOME_DIAGRAM_FALLBACK,
  formatRelayDiagramContent,
  relayDiagramContentSchema,
} from "../src/home-diagram-content";

describe("RelayHomeCountsDataSource", () => {
  let datasource: RelayHomeCountsDataSource;
  let entityService: IEntityService;
  let context: BaseDataSourceContext;

  beforeEach(() => {
    datasource = new RelayHomeCountsDataSource();
    entityService = createMockEntityService({
      entityTypes: [
        "site-content",
        "base",
        "link",
        "topic",
        "summary",
        "agent",
      ],
      returns: {
        getEntity: createTestEntity("site-content", {
          id: "home:diagram",
          content: formatRelayDiagramContent({
            ...RELAY_HOME_DIAGRAM_FALLBACK,
            headline: "Custom diagram headline",
          }),
          metadata: { routeId: "home", sectionId: "diagram" },
        }),
      },
    });
    context = { entityService };
  });

  it("merges editable diagram content with live entity counts", async () => {
    const countsByType: Record<string, number> = {
      base: 7,
      link: 3,
      topic: 4,
      summary: 2,
      agent: 1,
    };
    const countSpy = spyOn(entityService, "countEntities").mockImplementation(
      async ({ entityType }) => countsByType[entityType] ?? 0,
    );

    const result = await datasource.fetch(
      { query: { routeId: "home", sectionId: "diagram" } },
      relayDiagramContentSchema,
      context,
    );

    expect(result.headline).toBe("Custom diagram headline");
    expect(result.counts).toEqual({
      captures: 7,
      links: 3,
      topics: 4,
      summaries: 2,
      peers: 1,
    });
    expect(countSpy).toHaveBeenCalledTimes(5);
    expect(countSpy).toHaveBeenCalledWith({ entityType: "base" });
    expect(countSpy).toHaveBeenCalledWith({ entityType: "agent" });
  });

  it("renders fallback content and zero counts for missing/unregistered entities", async () => {
    entityService = createMockEntityService({
      entityTypes: ["site-content", "base"],
      returns: { getEntity: null },
    });
    context = { entityService };
    const countSpy = spyOn(entityService, "countEntities").mockResolvedValue(5);

    const result = await datasource.fetch(
      {},
      relayDiagramContentSchema,
      context,
    );

    expect(result.headline).toBe(RELAY_HOME_DIAGRAM_FALLBACK.headline);
    expect(result.counts).toEqual({
      captures: 5,
      links: 0,
      topics: 0,
      summaries: 0,
      peers: 0,
    });
    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(countSpy).toHaveBeenCalledWith({ entityType: "base" });
  });
});
