import { describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
  type BaseEntity,
} from "@brains/plugins";
import { createMockEntityPluginContext } from "@brains/test-utils";
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
    // The factory's namespaces are real and spied, so the registration runs
    // against the actual messaging and dashboard implementations and the
    // captured arguments are read back off the spies — no stand-in namespace,
    // and nothing asserting a narrower signature than the real one.
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async (): Promise<BaseEntity[]> => topics,
    });

    registerTopicsDashboardWidget({ context });

    expect(context.messaging.subscribe).toHaveBeenCalledWith(
      SYSTEM_CHANNELS.pluginsRegistered,
      expect.any(Function),
    );

    // Publish the real message rather than fishing the handler out of a spy:
    // this drives the same path production takes, and the widget registration
    // below is the evidence it ran.
    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(context.dashboard.registerWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "topics",
        group: "knowledge",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
        digestProvider: expect.any(Function),
      }),
    );

    const [registerCall] = context.dashboard.registerWidget.mock.calls;
    const registeredWidget = registerCall?.[0];
    if (!registeredWidget) throw new Error("Widget was not registered");

    // dataProvider takes the provider context and is declared Promise<unknown>,
    // so assert the whole value rather than narrowing to a shape first —
    // toEqual checks every key, where narrowing checks only the ones named.
    const data = await registeredWidget.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });

    expect(data.view.blocks[0]).toEqual({
      type: "list",
      id: "topics",
      empty: "No topics yet.",
      items: [
        {
          id: "human-ai-collaboration",
          title: "Human-AI Collaboration",
          description: "Humans and AI systems work together.",
        },
      ],
    });
  });
});
