import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
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

    let registeredWidget: unknown;
    const send = mock(
      async (_topic: string, payload: unknown): Promise<void> => {
        registeredWidget = payload;
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
      messaging: { send, subscribe },
      entityService: {
        listEntities: mock(async (): Promise<BaseEntity[]> => topics),
      },
    } as unknown as EntityPluginContext;

    registerTopicsDashboardWidget({ context, pluginId: "topics" });

    expect(subscribe).toHaveBeenCalledWith(
      "system:plugins:ready",
      expect.any(Function),
    );
    expect(readyHandler).toBeDefined();

    const result = await readyHandler?.();
    expect(result).toEqual({ success: true });

    expect(send).toHaveBeenCalledWith(
      "dashboard:register-widget",
      expect.objectContaining({
        id: "topics",
        pluginId: "topics",
        rendererName: "ListWidget",
      }),
    );

    const widget = registeredWidget as {
      dataProvider: () => Promise<{ items: Array<Record<string, unknown>> }>;
    };
    const data = await widget.dataProvider();

    expect(data.items).toEqual([
      {
        id: "human-ai-collaboration",
        name: "Human-AI Collaboration",
        description: "Humans and AI systems work together.",
      },
    ]);
  });
});
