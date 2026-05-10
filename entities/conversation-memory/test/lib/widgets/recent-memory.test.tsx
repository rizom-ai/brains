/** @jsxImportSource preact */
import { describe, expect, it, mock } from "bun:test";
import { render } from "preact-render-to-string";
import type { EntityPluginContext } from "@brains/plugins";
import { SummaryAdapter } from "../../../src/adapters/summary-adapter";
import { createMockSummaryEntity } from "../../fixtures/summary-entities";
import { buildRecentConversationMemoryData } from "../../../src/lib/widgets/recent-memory";
import { RecentConversationMemoryWidget } from "../../../src/lib/widgets/recent-memory-widget";
import type { SummaryEntity, SummaryEntry } from "../../../src/schemas/summary";

const adapter = new SummaryAdapter();

function buildSummary(params: {
  id: string;
  channelId: string;
  channelName?: string;
  entries: SummaryEntry[];
}): SummaryEntity {
  const content = adapter.createContentBody(params.entries);
  return createMockSummaryEntity({
    id: params.id,
    content,
    metadata: {
      conversationId: params.id,
      channelId: params.channelId,
      ...(params.channelName !== undefined
        ? { channelName: params.channelName }
        : {}),
      interfaceType: "cli",
      messageCount: params.entries.reduce(
        (sum, entry) => sum + entry.sourceMessageCount,
        0,
      ),
      entryCount: params.entries.length,
      sourceHash: "h",
      projectionVersion: 1,
    },
  });
}

function entry(overrides: {
  title: string;
  end: string;
  start?: string;
  count?: number;
  keyPoint?: string;
}): SummaryEntry {
  return {
    title: overrides.title,
    summary: "Summary text.",
    timeRange: {
      start: overrides.start ?? overrides.end,
      end: overrides.end,
    },
    sourceMessageCount: overrides.count ?? 5,
    keyPoints: overrides.keyPoint ? [overrides.keyPoint] : [],
  };
}

describe("buildRecentConversationMemoryData", () => {
  it("returns latest entries across all summaries and unique-by-channel rollup", async () => {
    const summaries: SummaryEntity[] = [
      buildSummary({
        id: "s-design",
        channelId: "design",
        channelName: "Design",
        entries: [
          entry({
            title: "Design A",
            end: "2026-05-09T00:00:00.000Z",
            keyPoint: "decision on A",
          }),
          entry({
            title: "Design B",
            end: "2026-05-08T00:00:00.000Z",
          }),
        ],
      }),
      buildSummary({
        id: "s-ops",
        channelId: "ops",
        channelName: "Ops",
        entries: [
          entry({
            title: "Ops planning",
            end: "2026-05-09T12:00:00.000Z",
            keyPoint: "deploy plan",
            count: 9,
          }),
        ],
      }),
    ];
    const context = {
      entityService: { listEntities: mock(async () => summaries) },
    } as unknown as EntityPluginContext;

    const data = await buildRecentConversationMemoryData(context);

    expect(data.all.map((row) => row.title)).toEqual([
      "Ops planning",
      "Design A",
      "Design B",
    ]);
    expect(data.byChannel.map((row) => row.channelId)).toEqual([
      "ops",
      "design",
    ]);
    const ops = data.byChannel[0];
    expect(ops?.title).toBe("Ops planning");
    expect(ops?.keyPoint).toBe("deploy plan");
    expect(ops?.messageCount).toBe(9);
  });
});

describe("RecentConversationMemoryWidget", () => {
  it("renders both panels with view tabs", () => {
    const html = render(
      <RecentConversationMemoryWidget
        title="Recent conversation memory"
        data={{
          all: [
            {
              id: "s-design#0",
              title: "Design A",
              keyPoint: "decision on A",
              channelName: "Design",
              channelId: "design",
              timeRange: {
                start: "2026-05-09T00:00:00.000Z",
                end: "2026-05-09T00:00:00.000Z",
              },
              messageCount: 5,
            },
          ],
          byChannel: [
            {
              id: "s-ops#0",
              title: "Ops planning",
              keyPoint: "deploy plan",
              channelName: "Ops",
              channelId: "ops",
              timeRange: {
                start: "2026-05-09T12:00:00.000Z",
                end: "2026-05-09T12:00:00.000Z",
              },
              messageCount: 9,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("data-recent-memory-widget");
    expect(html).toContain('data-recent-memory-view-tab="all"');
    expect(html).toContain('data-recent-memory-view-tab="byChannel"');
    expect(html).toContain('data-recent-memory-panel="all"');
    expect(html).toContain('data-recent-memory-panel="byChannel"');
    expect(html).toContain("Design A");
    expect(html).toContain("Ops planning");
    expect(html).toContain("#Design");
    expect(html).toContain("9 msgs");
  });
});
