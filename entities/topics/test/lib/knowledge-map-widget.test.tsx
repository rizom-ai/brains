/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import {
  knowledgeMapWidgetRegistration,
  registerKnowledgeMapDashboardWidget,
  type KnowledgeMapWidgetContext,
} from "../../src/lib/knowledge-map-widget";
import type { DashboardWidgetRegistration } from "@brains/plugins";
import type { KnowledgeMapDataContext } from "../../src/lib/knowledge-map-data";
import { KnowledgeMapWidget } from "../../src/widgets/knowledge-map";

/* The console widget integration. The narrow
   structural contexts keep every stub honestly typed — no casts. */

function makeDataContext(): KnowledgeMapDataContext {
  return {
    semantic: {
      project: () =>
        Promise.resolve({
          points: [
            {
              entityId: "future-of-work",
              entityType: "topic",
              coordinates: [0, 0] as [number, number],
              distanceToOrigin: 0.2,
            },
            {
              entityId: "play-essay",
              entityType: "post",
              coordinates: [1, 0.5] as [number, number],
              distanceToOrigin: 0.25,
            },
          ],
        }),
    },
    entityService: {
      listEntities: (request: { entityType: string }) =>
        Promise.resolve(
          request.entityType === "topic"
            ? [
                {
                  id: "future-of-work",
                  entityType: "topic",
                  content: "# Future of Work\n\nnotes",
                },
              ]
            : [
                {
                  id: "play-essay",
                  entityType: "post",
                  content: "# The Future of Work is Play\n\nbody",
                },
              ],
        ),
    },
  };
}

describe("knowledgeMapWidgetRegistration", () => {
  it("builds the payload with the live data provider and honest digest", async () => {
    const registration = knowledgeMapWidgetRegistration(makeDataContext());

    expect(registration.id).toBe("topics-knowledge-map");
    expect(registration.title).toBe("Knowledge Map");
    expect(registration.group).toBe("knowledge");
    expect(registration.section).toBe("primary");
    expect(registration.rendererName).toBe("KnowledgeMapWidget");
    expect(registration.clientStyles).toContain(".kmap");
    expect(registration.clientStyles).toContain(".kmap-field");

    const data = await registration.dataProvider();
    expect(data.zones.map((zone) => zone.name)).toEqual(["Future of Work"]);
    expect(data.counts).toEqual({ entities: 2, topics: 1 });

    expect(registration.digestProvider(data).digest).toEqual([
      { label: "Entities", value: "2" },
      { label: "Topics", value: "1" },
    ]);
  });
});

describe("registerKnowledgeMapDashboardWidget", () => {
  it("registers the payload once plugins are ready", async () => {
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;
    const registered: DashboardWidgetRegistration[] = [];

    const context: KnowledgeMapWidgetContext = {
      ...makeDataContext(),
      messaging: {
        subscribe: (_channel, handler) => {
          readyHandler = handler;
          return () => undefined;
        },
      },
      dashboard: {
        registerWidget: (widget) => {
          registered.push(widget);
          return Promise.resolve();
        },
      },
    };

    registerKnowledgeMapDashboardWidget({ context });
    expect(readyHandler).toBeDefined();

    const result = await readyHandler?.();
    expect(result).toEqual({ success: true });
    expect(registered).toHaveLength(1);
    expect(registered[0]?.id).toBe("topics-knowledge-map");
  });
});

describe("KnowledgeMapWidget", () => {
  it("renders the map for valid data and a quiet fallback otherwise", () => {
    const html = render(
      <KnowledgeMapWidget
        title="Knowledge Map"
        data={{
          zones: [
            {
              id: "t",
              name: "Future of Work",
              x: 0.4,
              y: 0.4,
              memberIds: ["p"],
            },
          ],
          points: [
            {
              id: "p",
              entityType: "post",
              title: "The Essay",
              kind: "published",
              x: 0.42,
              y: 0.44,
              zoneId: "t",
            },
          ],
          counts: { entities: 2, topics: 1 },
        }}
      />,
    );
    expect(html).toContain("kmap-field");
    expect(html).toContain("kmap--dashboard");
    expect(html).toContain("Future of Work");

    const fallback = render(
      <KnowledgeMapWidget title="Knowledge Map" data={{ nope: true }} />,
    );
    expect(fallback).toContain("Nothing to show yet");
  });
});
