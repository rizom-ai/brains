import { describe, expect, it, mock } from "bun:test";
import {
  SYSTEM_CHANNELS,
  type BaseEntity,
  type DashboardWidgetProviderContext,
  type EntityPluginContext,
} from "@brains/plugins";
import { registerTopicsDashboardWidget } from "../../src/lib/dashboard-widget";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const adapter = new TopicAdapter();

function createTopic(id: string, title: string, content: string): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType: "topic",
    content: adapter.createTopicBody({ title, content }),
    contentHash: "hash",
    visibility: "public",
    metadata: {},
    created: now,
    updated: now,
  };
}

describe("registerTopicsDashboardWidget", () => {
  it("registers a dashboard widget with topic items", async () => {
    const topics = [
      createTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
        "Humans and AI systems work together. More detail follows.",
      ),
    ];
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;

    let registeredWidget:
      | {
          dataProvider: (context: DashboardWidgetProviderContext) => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        }
      | undefined;
    const registerWidget = mock(
      async (widget: {
        dataProvider: (context: DashboardWidgetProviderContext) => Promise<{
          items: Array<Record<string, unknown>>;
        }>;
      }): Promise<boolean> => {
        registeredWidget = widget;
        return true;
      },
    );
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
      messaging: { subscribe },
      dashboard: { registerWidget },
      entityService: {
        listEntities: mock(async (): Promise<BaseEntity[]> => topics),
      },
    } as unknown as EntityPluginContext;

    registerTopicsDashboardWidget({ context });

    expect(subscribe).toHaveBeenCalledWith(
      SYSTEM_CHANNELS.pluginsRegistered,
      expect.any(Function),
    );
    expect(readyHandler).toBeDefined();

    const result = await readyHandler?.();
    expect(result).toEqual({ success: true });

    expect(registerWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "topics",
        group: "knowledge",
        rendererName: "ListWidget",
        digestProvider: expect.any(Function),
      }),
    );

    expect(registeredWidget).toBeDefined();
    if (!registeredWidget) throw new Error("Widget was not registered");

    const data = await registeredWidget.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });

    expect(data.items).toEqual([
      {
        id: "human-ai-collaboration",
        name: "Human-AI Collaboration",
        description: "Humans and AI systems work together.",
      },
    ]);
  });
});
