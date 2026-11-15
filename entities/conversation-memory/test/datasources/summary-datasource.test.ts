import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { scopeEntityReads } from "@brains/entity-service";
import type {
  BaseDataSourceContext,
  DataSource,
  IEntityService,
} from "@brains/plugins";
import { composeSummaryBody } from "../../src/lib/summary-body";
import { createConversationMemoryPlugins } from "../conversation-memory-plugins";
import { summaryListSchema } from "../../src/templates/summary-list/schema";
import { summaryDetailSchema } from "../../src/templates/summary-detail/schema";
import {
  createMockSummaryEntity,
  defaultSummaryMetadata,
} from "../fixtures/summary-entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
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

describe("the summary data source", () => {
  let datasource: DataSource & Required<Pick<DataSource, "fetch">>;
  let shell: MockShell;
  let entityService: IEntityService;
  let context: BaseDataSourceContext;
  beforeEach(async () => {
    shell = createMockShell();
    entityService = shell.getEntityService();
    // Production resolves templates through reads scoped to the caller; an
    // owner's view sees the summaries' non-public visibility.
    context = {
      entityService: scopeEntityReads(entityService, {
        visibilityScope: "restricted",
      }),
    };
    for (const plugin of createConversationMemoryPlugins())
      await plugin.register(shell);
    const registered = shell
      .getDataSourceRegistry()
      .get("conversation-memory:entities");
    if (!registered?.fetch) throw new Error("No summary data source");
    datasource = { ...registered, fetch: registered.fetch };
  });

  it("fetches a single summary", async () => {
    const metadata = {
      channelName: "CLI",
      channelId: "cli",
      interfaceType: "cli",
      messageCount: 2,
      sourceHash: "hash",
      timeRange: entry.timeRange,
    };
    // Stored as the brain stores a summary: its document, header and body.
    const summary = createMockSummaryEntity({
      id: "conv-123",
      content: generateMarkdown(metadata, composeSummaryBody([entry])),
      metadata,
    });
    shell.addEntities([summary]);

    const result = await datasource.fetch(
      { entityType: "summary", query: { conversationId: "conv-123" } },
      summaryDetailSchema,
      context,
    );

    expect(result.conversationId).toBe("conv-123");
    expect(result.messageCount).toBe(2);
    expect(result.entries[0]?.title).toBe("Eval Plan");
  });

  it("fetches summary list data", async () => {
    shell.addEntities([
      createMockSummaryEntity({
        content: generateMarkdown(
          defaultSummaryMetadata,
          composeSummaryBody([entry]),
        ),
      }),
    ]);

    const result = await datasource.fetch(
      { entityType: "summary", query: { limit: 10 } },
      summaryListSchema,
      context,
    );

    expect(result.totalCount).toBe(1);
    expect(result.summaries[0]?.messageCount).toBe(2);
    expect(result.summaries[0]?.latestEntry).toBe("Eval Plan");
  });

  it("throws when requested summary is missing", () => {
    expect(
      datasource.fetch(
        { entityType: "summary", query: { id: "missing" } },
        summaryDetailSchema,
        context,
      ),
    ).rejects.toThrow("Summary not found: missing");
  });
});
