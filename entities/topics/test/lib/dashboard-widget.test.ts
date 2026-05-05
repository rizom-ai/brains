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

    let registeredWidget:
      | {
          dataProvider: () => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        }
      | undefined;
    const send = mock(
      async (request: {
        type: string;
        payload: {
          dataProvider: () => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        };
      }): Promise<void> => {
        registeredWidget = request.payload;
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

    expect(send).toHaveBeenCalledWith({
      type: "dashboard:register-widget",
      payload: expect.objectContaining({
        id: "topics",
        pluginId: "topics",
        rendererName: "ListWidget",
      }),
    });

    expect(registeredWidget).toBeDefined();
    if (!registeredWidget) throw new Error("Widget was not registered");

    const data = await registeredWidget.dataProvider();

    expect(data.items).toEqual([
      {
        id: "human-ai-collaboration",
        name: "Human-AI Collaboration",
        description: "Humans and AI systems work together.",
      },
    ]);
  });
});
