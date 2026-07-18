/** @jsxImportSource preact */
import { describe, expect, it, mock } from "bun:test";
import { render } from "preact-render-to-string";
import type { EntityPluginContext } from "@brains/plugins";
import { registerKnowledgeMapDashboardWidget } from "../../src/lib/knowledge-map-widget";
import { KnowledgeMapWidget } from "../../src/widgets/knowledge-map";

/* Phase 3 of docs/plans/knowledge-map.md: the console widget. Registered
   like every dashboard widget (agent-network pattern): a component + shared
   styles, a dataProvider that runs the phase-1 builder against the live
   context, and a digest with the honest counts. */

describe("registerKnowledgeMapDashboardWidget", () => {
  it("registers the widget and wires the builder as its data provider", async () => {
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;
    let payload: Record<string, unknown> | undefined;

    const send = mock(
      async (request: {
        type: string;
        payload: Record<string, unknown>;
      }): Promise<void> => {
        payload = request.payload;
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
      semantic: {
        project: mock(async () => ({
          origin: { kind: "centroid" as const },
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
          neighbors: [],
          distanceRange: { min: 0.2, max: 0.25 },
        })),
      },
      entityService: {
        listEntities: mock(async (request: { entityType: string }) =>
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
    } as unknown as EntityPluginContext;

    registerKnowledgeMapDashboardWidget({ context, pluginId: "topics" });
    expect(subscribe).toHaveBeenCalledWith(
      "system:plugins:ready",
      expect.any(Function),
    );

    const result = await readyHandler?.();
    expect(result).toEqual({ success: true });

    expect(send).toHaveBeenCalledWith({
      type: "dashboard:register-widget",
      payload: expect.objectContaining({
        id: "topics-knowledge-map",
        pluginId: "topics",
        title: "Knowledge Map",
        group: "knowledge",
        section: "primary",
        rendererName: "KnowledgeMapWidget",
        component: expect.any(Function),
        digestProvider: expect.any(Function),
      }),
    });
    if (!payload) throw new Error("widget was not registered");

    // shared styles travel with the widget
    expect(String(payload["clientStyles"])).toContain(".kmap");

    // the data provider runs the phase-1 builder against the live context
    const dataProvider = payload["dataProvider"] as () => Promise<unknown>;
    const data = (await dataProvider()) as {
      zones: { name: string }[];
      counts: { entities: number; topics: number };
    };
    expect(data.zones.map((zone) => zone.name)).toEqual(["Future of Work"]);
    expect(data.counts).toEqual({ entities: 2, topics: 1 });

    // the digest carries the honest counts
    const digestProvider = payload["digestProvider"] as (value: unknown) => {
      digest: { label: string; value: string }[];
    };
    expect(digestProvider(data).digest).toEqual([
      { label: "Entities", value: "2" },
      { label: "Topics", value: "1" },
    ]);
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
              memberIds: [],
            },
          ],
          points: [],
          counts: { entities: 1, topics: 1 },
        }}
      />,
    );
    expect(html).toContain("kmap--dashboard");
    expect(html).toContain("Future of Work");

    const fallback = render(
      <KnowledgeMapWidget title="Knowledge Map" data={{ nope: true }} />,
    );
    expect(fallback).toContain("Nothing to show yet");
  });
});
