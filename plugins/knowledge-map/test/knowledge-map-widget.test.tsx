import { describe, expect, it } from "bun:test";
import type { JSX } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type DashboardWidgetRegistration,
  type Plugin,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import knowledgeMapPackage, { KNOWLEDGE_MAP_WIDGET_ID } from "../src";
import packageJson from "../package.json";
import { z } from "@brains/utils/zod";

/** The knowledge-map service, as the runtime would build it. */
function knowledgeMapPlugin(): Plugin {
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(knowledgeMapPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    knowledgeMapPackage,
    {},
    metadata,
  )[0];
  if (!plugin) throw new Error("Knowledge map plugin was not created");
  return plugin;
}

describe("the knowledge map dashboard widget", () => {
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
    const plugin = knowledgeMapPlugin();
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

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

  it("carries the cartographic renderer so the dashboard draws the real map", async () => {
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
    const plugin = knowledgeMapPlugin();
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    if (!registration) throw new Error("Knowledge Map was not registered");
    const renderer = registration.renderer;
    if (!renderer) throw new Error("Knowledge Map carried no renderer");
    expect(typeof renderer.component).toBe("function");
    expect(renderer.clientStyles).toContain(".kmap");

    const data = z.looseObject({ source: z.unknown() }).parse(
      await registration.dataProvider({
        caller: null,
        signal: new AbortController().signal,
      }),
    );
    // A self-drawing widget carries its own data beside the semantic view.
    expect(data.source).toMatchObject({
      zones: [{ id: "future-of-work", name: "Future of Work" }],
    });

    if (typeof renderer.component !== "function") {
      throw new Error("The knowledge-map renderer carried no component");
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `DashboardWidgetRenderer.component` is deliberately `unknown` so the shell depends on no rendering library; the check above establishes callability and only the call signature remains
    const Component = renderer.component as (props: {
      data: unknown;
    }) => JSX.Element;
    const html = render(<Component data={data.source} />);
    // The bespoke SVG field, not the generic spatial block renderer.
    expect(html).toContain("kmap-field--dashboard");
    expect(html).toContain("<svg");
    expect(html).not.toContain("operator-spatial");
  });
});
