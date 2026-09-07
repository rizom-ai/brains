import { describe, expect, test } from "bun:test";
import { ProximityMapDataSource } from "@brains/agent-discovery";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockEntityService } from "@brains/entity-service/test";
import { z } from "@rizom/site";
import { brainNetworkSchema, brainNetworkTemplate } from "../src/brain-network";
import { aiRoutes } from "../src/routes";

const copy = {
  cap: "03 · Collective",
  headline: "Different knowledge. *Shared work.*",
  body: ["People choose the work."],
  aside: { text: "Owned knowledge.", links: [] },
};
const map = {
  center: { kind: "identity" },
  nodes: [
    {
      id: "alpha",
      name: "Alpha",
      kind: "person",
      status: "approved",
      tags: ["Climate"],
      distance: 0.3,
      bearing: 45,
    },
  ],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0.3, max: 0.3 },
  pendingCount: 0,
};
function render(data: unknown): string {
  const component = z
    .custom<ComponentType<Record<string, unknown>>>(
      (value) => typeof value === "function",
    )
    .parse(brainNetworkTemplate.layout?.component);
  const props = z
    .record(z.string(), z.unknown())
    .parse(brainNetworkSchema.parse(data));
  return renderToStaticMarkup(createElement(component, props));
}

describe("Brain landing's own interactive network", () => {
  test("routes through a public datasource-backed template and the existing map script", () => {
    expect(
      aiRoutes.find((route) => route.id === "brain")?.sections,
    ).toContainEqual({
      id: "connect",
      template: "brain-network:connect",
      dataQuery: {},
    });
    expect(brainNetworkTemplate.requiredPermission).toBe("public");
    expect(brainNetworkTemplate.dataSourceId).toBe(
      "agent-discovery:proximity-map",
    );
    expect(brainNetworkTemplate.runtimeScripts).toContainEqual({
      src: "/scripts/agent-proximity-map.js",
      defer: true,
    });
    expect(
      brainNetworkTemplate.staticAssets?.["/scripts/agent-proximity-map.js"],
    ).toContain("data-proximity-map");
  });
  test("renders the real map inside the existing chapter, not an image or iframe", () => {
    const html = render({ ...copy, map });
    expect(html).toContain('id="collective"');
    expect(html).toContain('class="chapter-grid"');
    expect(html).toContain("data-proximity-map");
    expect(html).toContain("Alpha");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("snapshot");
  });
  test("uses the supplied entity-service context and preserves a genuinely empty map", async () => {
    const entityService = createMockEntityService();
    const data = await new ProximityMapDataSource().fetch(
      {},
      brainNetworkSchema,
      { entityService },
    );
    expect(entityService.projectSemanticSpace).toHaveBeenCalledWith({
      types: ["agent"],
      origin: { entityId: "brain-character", entityType: "brain-character" },
      maxNeighborDistance: 0.25,
    });
    expect(data.map?.nodes).toEqual([]);
    expect(render({ ...data, ...copy })).toContain("data-proximity-map-empty");
  });
  test("authored fallback shows unavailability rather than inventing a network", () => {
    const formatter = brainNetworkTemplate.formatter;
    if (!formatter) throw new Error("Fallback formatter missing");
    const data = brainNetworkSchema.parse(
      formatter.parse(formatter.format(copy)),
    );
    expect(data.map).toBeNull();
    const html = render({ ...data, ...copy });
    expect(html).toContain("The network map isn’t available right now.");
    expect(html).not.toContain("private diagnostic");
    expect(html).not.toContain("data-proximity-map-empty");
  });
  test("authored copy is separate from the live graph", () => {
    const formatter = brainNetworkTemplate.overlayFormatter;
    if (!formatter) throw new Error("Network copy formatter missing");
    const markdown = formatter.format(copy);
    expect(formatter.parse(markdown)).toEqual(copy);
    expect(markdown).not.toContain("## Map");
    expect(markdown).not.toContain("## Capture");
  });
});
