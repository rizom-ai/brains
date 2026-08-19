import { describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import {
  createEntityPluginContext,
  createMockShell,
} from "@brains/plugins/test";
import {
  KNOWLEDGE_MAP_WIDGET_ID,
  registerKnowledgeMapDashboardWidget,
} from "../src/knowledge-map-widget";

describe("registerKnowledgeMapDashboardWidget", () => {
  it("registers one normalized semantic projection once plugins are ready", async () => {
    const shell = createMockShell();
    Object.assign(shell.getEntityService(), {
      projectSemanticSpace: async () => ({
        points: [
          {
            entityId: "future-of-work",
            entityType: "topic",
            coordinates: [0, 0],
            distanceToOrigin: 0.2,
          },
          {
            entityId: "play-essay",
            entityType: "post",
            coordinates: [1, 0.5],
            distanceToOrigin: 0.25,
          },
        ],
      }),
    });
    shell.addEntities([
      {
        id: "future-of-work",
        entityType: "topic",
        content: "# Future of Work\n\nnotes",
        contentHash: "topic-hash",
        visibility: "public",
        metadata: {},
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
      },
      {
        id: "play-essay",
        entityType: "post",
        content: "# The Future of Work is Play\n\nbody",
        contentHash: "post-hash",
        visibility: "public",
        metadata: {},
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
      },
    ]);
    let registration: DashboardWidgetRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<DashboardWidgetRegistration>(
        "dashboard:register-widget",
        (message) => {
          registration = message.payload;
          return { success: true };
        },
      );
    const context = createEntityPluginContext(shell, "topics");

    registerKnowledgeMapDashboardWidget({ context });
    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    expect(registration).toMatchObject({
      id: KNOWLEDGE_MAP_WIDGET_ID,
      title: "Knowledge Map",
      group: "knowledge",
      section: "primary",
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    });
    if (!registration) throw new Error("Knowledge Map was not registered");
    const data = await registration.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });
    expect(data).toMatchObject({
      view: {
        blocks: [
          {
            type: "spatial",
            layout: "cartesian",
            points: [
              {
                id: "post:play-essay",
                label: "The Future of Work is Play",
                category: "published",
              },
            ],
            zones: [
              {
                id: "topic:future-of-work",
                label: "Future of Work",
                memberIds: [],
              },
            ],
          },
        ],
      },
      digest: {
        items: [
          { label: "Entities", value: "2" },
          { label: "Topics", value: "1" },
        ],
      },
    });
  });
});
