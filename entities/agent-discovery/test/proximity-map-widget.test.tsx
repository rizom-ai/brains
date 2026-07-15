/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import {
  AgentProximityWidget,
  ProximityMap,
} from "../src/widgets/proximity-map";
import { proximityMapScript } from "../src/widgets/proximity-map-script";
import type { ProximityMapData } from "../src/lib/proximity-map-schema";

const data: ProximityMapData = {
  center: { kind: "identity" },
  nodes: [
    {
      id: "alpha",
      name: "Alpha",
      kind: "professional",
      status: "approved",
      tags: ["research"],
      distance: 0.25,
      bearing: 30,
    },
    {
      id: "beta",
      name: "Beta",
      kind: "team",
      status: "discovered",
      tags: ["research"],
      distance: 0.5,
      bearing: 50,
    },
    {
      id: "old",
      name: "Old Agent",
      kind: "professional",
      status: "archived",
      tags: [],
      distance: 0.45,
      bearing: 210,
    },
    {
      id: "gamma",
      name: "Gamma",
      kind: "collective",
      status: "approved",
      tags: ["design"],
      distance: 0.4,
      bearing: 140,
    },
  ],
  clusters: [
    {
      label: "research · 2",
      memberIds: ["alpha", "beta"],
      links: [{ sourceId: "alpha", targetId: "beta" }],
    },
  ],
  sightings: [
    {
      id: "vale",
      name: "Vale",
      viaIds: ["alpha", "gamma"],
      tags: ["research", "methods"],
      distance: 0.44,
      bearing: 120,
    },
  ],
  distanceRange: { min: 0.25, max: 0.5 },
  pendingCount: 1,
};

describe("ProximityMap", () => {
  test("renders rings, center, nodes, clusters, and indexing state", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).toContain("data-proximity-map");
    expect(html).toContain('data-proximity-ring="0.2"');
    expect(html).toContain('data-proximity-center="identity"');
    expect(html).toContain('data-proximity-node="alpha"');
    expect(html).toContain('data-proximity-node="beta"');
    expect(html).toContain('data-proximity-node="old"');
    expect(html).toContain('data-proximity-status="archived"');
    expect(html).toContain("proximity-archived-remnant");
    expect(html).toContain('stroke-opacity="0.045"');
    expect(html).toContain("archived trace");
    expect(html).toContain('data-proximity-node-cluster="cluster-0"');
    expect(html).toContain('data-proximity-cluster="research · 2"');
    expect(html).toContain('data-proximity-cluster-id="cluster-0"');
    expect(html).toContain("data-proximity-tooltip");
    expect(html).toContain("pending indexing");
  });

  test("gives the map the full card width — no chart column", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).not.toContain("proximity-hud-chart");
    expect(html).not.toContain("data-proximity-constellation");
    expect(html).not.toContain("data-proximity-freeagents");
    // constellations stay legible on the map itself
    expect(html).toContain('data-proximity-cluster="research · 2"');
    expect(html).toContain("proximity-cluster-label");
  });

  test("charts sightings at half light, routed through their introducers", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).toContain('data-proximity-sighting="vale"');
    // threads grow from BOTH introducers, never from the center
    const threads = html.split("proximity-sighting-thread").length - 1;
    expect(threads).toBe(2);
    // hover metadata: readable names and matchable ids
    expect(html).toContain('data-proximity-via="Alpha · Gamma"');
    expect(html).toContain('data-proximity-via-ids="alpha gamma"');
  });

  test("skips sightings whose introducers are not on the map", () => {
    const orphaned: ProximityMapData = {
      ...data,
      sightings: [
        {
          id: "ghost",
          name: "Ghost",
          viaIds: ["nobody"],
          tags: [],
          distance: 0.3,
          bearing: 200,
        },
      ],
    };

    const html = render(<ProximityMap data={orphaned} />);
    expect(html).not.toContain('data-proximity-sighting="ghost"');
  });

  test("breathes a ripple whose arrival order is the proximity order", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).toContain("proximity-ripple");
    expect(html).toContain('attributeName="r"');
    // every non-archived bulb answers the wavefront when it arrives;
    // archived traces stay dark (alpha, beta, gamma — not old)
    const shimmers = html.split("proximityRippleShimmer").length - 1;
    expect(shimmers).toBe(3);
  });

  test("runs nutrient pulses along approved threads only", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).toContain("proximity-pulse");
    expect(html).toContain("<animateMotion");
    expect(html).toContain('href="#proximity-thread-dashboard-alpha"');
    expect(html).toContain('href="#proximity-thread-dashboard-gamma"');
    // no pulse rides a pending or archived thread
    expect(html).not.toContain('href="#proximity-thread-dashboard-beta"');
    expect(html).not.toContain('href="#proximity-thread-dashboard-old"');
  });

  test("namespaces SVG defs per surface so two maps can share a page", () => {
    const dashboardHtml = render(<ProximityMap data={data} />);
    const siteHtml = render(<ProximityMap data={data} surface="site" />);

    expect(dashboardHtml).toContain('id="proximity-blur-dashboard"');
    expect(dashboardHtml).toContain("url(#proximity-blur-dashboard)");
    expect(siteHtml).toContain('id="proximity-blur-site"');
    expect(siteHtml).toContain("url(#proximity-mist-site)");
    expect(siteHtml).not.toContain('id="proximity-blur-dashboard"');
  });

  test("does not claim button semantics it cannot honor", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).not.toContain('role="button"');
    // SVG attributes keep their casing in preact SSR output
    expect(html).toContain('tabIndex="0"');
  });

  test("switches to dense label mode past the label budget", () => {
    const denseData: ProximityMapData = {
      ...data,
      nodes: Array.from({ length: 32 }, (_, index) => ({
        id: `agent-${index}`,
        name: `Agent ${index}`,
        kind: "professional" as const,
        status: "approved" as const,
        tags: [],
        distance: 0.2 + (index % 10) * 0.05,
        bearing: (index * 137.5) % 360,
      })),
      clusters: [],
    };

    expect(render(<ProximityMap data={denseData} />)).toContain(
      "proximity-field--dense",
    );
    expect(render(<ProximityMap data={data} />)).not.toContain(
      "proximity-field--dense",
    );
  });

  test("renders a useful empty state and centroid notice", () => {
    const html = render(
      <AgentProximityWidget
        title="Agent Proximity"
        data={{
          center: { kind: "centroid" },
          nodes: [],
          clusters: [],
          sightings: [],
          distanceRange: { min: 0, max: 0 },
          pendingCount: 2,
        }}
      />,
    );

    expect(html).toContain("No indexed agents yet");
    expect(html).toContain("Identity not indexed yet");
  });

  test("fails closed on invalid widget data", () => {
    const html = render(
      <AgentProximityWidget title="Agent Proximity" data={{ nodes: [] }} />,
    );

    expect(html).toContain("Nothing to show yet");
  });
});

describe("proximityMapScript", () => {
  test("activates on tap, not just hover/focus — touch fires neither", () => {
    expect(proximityMapScript).toContain('addEventListener("click"');
    // A tap on the map ground dismisses whatever a previous tap lit up.
    expect(proximityMapScript).toContain("closest(");
  });

  test("clamps the tooltip inside the map on every edge", () => {
    // The horizontal clamp existed; without a bottom clamp a low node's
    // tooltip is clipped by the card's overflow:hidden.
    expect(proximityMapScript).toContain("offsetHeight");
  });
});
