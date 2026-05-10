import { describe, expect, it, mock } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
import {
  buildDecisionsWidgetData,
  registerDecisionsWidget,
} from "../../../src/lib/widgets/decisions";
import type { DecisionEntity } from "../../../src/schemas/conversation-memory";

function createDecision(overrides: {
  id: string;
  title: string;
  body?: string;
  status?: DecisionEntity["metadata"]["status"];
  start?: string;
  end?: string;
  channelName?: string;
}): DecisionEntity {
  const status = overrides.status ?? "active";
  const start = overrides.start ?? "2026-04-28T00:00:00.000Z";
  const end = overrides.end ?? "2026-04-28T01:00:00.000Z";
  const body = overrides.body ?? "We chose option A. Reasoning follows.";
  return createTestEntity<DecisionEntity>("decision", {
    id: overrides.id,
    content: `# ${overrides.title}\n\n${body}\n`,
    metadata: {
      conversationId: "c1",
      channelId: "c1-channel",
      channelName: overrides.channelName ?? "design",
      interfaceType: "cli",
      spaceId: "cli:design",
      timeRange: { start, end },
      sourceSummaryId: "s1",
      sourceMessageCount: 4,
      projectionVersion: 1,
      status,
    },
  });
}

describe("buildDecisionsWidgetData", () => {
  it("sorts active first then by timeRange end desc", async () => {
    const items: DecisionEntity[] = [
      createDecision({
        id: "older-active",
        title: "Older active",
        start: "2026-04-20T00:00:00.000Z",
        end: "2026-04-20T01:00:00.000Z",
      }),
      createDecision({
        id: "newer-superseded",
        title: "Newer superseded",
        status: "superseded",
        start: "2026-05-08T00:00:00.000Z",
        end: "2026-05-08T01:00:00.000Z",
      }),
      createDecision({
        id: "newer-active",
        title: "Newer active",
        start: "2026-05-09T00:00:00.000Z",
        end: "2026-05-09T01:00:00.000Z",
      }),
    ];
    const context = {
      entityService: { listEntities: mock(async () => items) },
    } as unknown as EntityPluginContext;

    const data = await buildDecisionsWidgetData(context);
    expect(data.items.map((item) => item.id)).toEqual([
      "newer-active",
      "older-active",
      "newer-superseded",
    ]);
    const first = data.items[0];
    expect(first?.name).toBe("Newer active");
    expect(first?.description).toBe("We chose option A.");
    expect(first?.status).toBe("active");
    expect(first?.meta).toEqual(["#design", "May 9"]);
  });

  it("formats multi-day time ranges with an en-dash", async () => {
    const items = [
      createDecision({
        id: "spanning",
        title: "Spanning",
        start: "2026-04-28T00:00:00.000Z",
        end: "2026-05-01T00:00:00.000Z",
      }),
    ];
    const context = {
      entityService: { listEntities: mock(async () => items) },
    } as unknown as EntityPluginContext;

    const data = await buildDecisionsWidgetData(context);
    expect(data.items[0]?.meta).toContain("Apr 28 – May 1");
    expect(data.items[0]?.meta).not.toContain('class="sep"');
  });
});

describe("registerDecisionsWidget", () => {
  it("registers a widget on system:plugins:ready", async () => {
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;
    let payload: Record<string, unknown> | undefined;
    const send = mock(async (request: { type: string; payload: unknown }) => {
      payload = request.payload as Record<string, unknown>;
    });
    const subscribe = mock(
      (
        _topic: string,
        handler: () => Promise<{ success: boolean }>,
      ): (() => void) => {
        readyHandler = handler;
        return (): void => undefined;
      },
    );
    const context = {
      messaging: { send, subscribe },
      entityService: { listEntities: mock(async () => []) },
    } as unknown as EntityPluginContext;

    registerDecisionsWidget({ context, pluginId: "conversation-memory" });
    await readyHandler?.();

    expect(payload).toMatchObject({
      id: "conversation-memory:decisions",
      pluginId: "conversation-memory",
      title: "Recent decisions",
      section: "secondary",
      priority: 30,
      rendererName: "ListWidget",
    });
  });
});
