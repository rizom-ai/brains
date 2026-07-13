/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import {
  AgentProximityWidget,
  ProximityMap,
} from "../src/widgets/proximity-map";
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
    expect(html).toContain("Chart");
    expect(html).not.toContain("Closest");
    expect(html).toContain('data-proximity-constellation="cluster-0"');
    expect(html).toContain("Alpha · Beta");
    expect(html).toContain("pending indexing");
  });

  test("charts unclustered active agents as free agents with hover linkage", () => {
    const html = render(<ProximityMap data={data} />);

    expect(html).toContain("data-proximity-freeagents");
    expect(html).toContain("free agents");
    // only unclustered ACTIVE agents chart as free agents — archived stay out
    expect(html).toContain(
      '<span class="proximity-constellation-members">Gamma</span>',
    );
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
    expect(html).toContain('tabindex="0"');
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
