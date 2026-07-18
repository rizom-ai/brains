/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { getTemplates } from "../src/lib/register-templates";
import type { ProximityMapData } from "../src/lib/proximity-map-schema";
import { AgentProximityMapTemplate } from "../src/templates/proximity-map-template";

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
      viaIds: ["alpha"],
      tags: ["research"],
      distance: 0.44,
      bearing: 120,
    },
  ],
  distanceRange: { min: 0.25, max: 0.5 },
  pendingCount: 1,
};

describe("AgentProximityMapTemplate", () => {
  test("renders the shared map in its paper site climate", () => {
    const html = render(<AgentProximityMapTemplate {...data} />);

    expect(html).toContain('class="agent-proximity-site"');
    expect(html).toContain("The rhizome grows");
    expect(html).toContain("proximity-field--site");
    // the site crop follows the map center so it stays valid if the
    // dashboard composition shifts
    expect(html).toContain('viewBox="180 0 680 520"');
    expect(html).toContain("research · 2");
    // Rev-10 foot: a quiet caption attached to the map, honest counts only.
    expect(html).toContain("constellations discovered");
    expect(html).toContain("the map is live");
    expect(html).toContain("pending semantic indexing");
    expect(html).toContain('href="/agents"');
    expect(html).not.toContain("proximity-hud-title");
    // The big-number ledger and the kind legend are gone.
    expect(html).not.toContain("archived traces");
    expect(html).not.toContain("agent-proximity-site__legend");
    expect(html).not.toContain("agent-proximity-site__stat-number");
  });

  test("renders byte-identically across consecutive builds", () => {
    expect(render(<AgentProximityMapTemplate {...data} />)).toBe(
      render(<AgentProximityMapTemplate {...data} />),
    );
  });

  test("renders authored hero copy over the map when copy fields are present", () => {
    const authored: ProximityMapData = {
      ...data,
      kicker: "The network, live",
      headingLead: "This is what expertise looks like",
      headingAccent: "when it's alive",
      lede: "Independent minds, each with an agent grown from what they know.",
      ctaLabel: "Meet the agents",
      ctaHref: "/network",
    };
    const html = render(<AgentProximityMapTemplate {...authored} />);

    expect(html).toContain("This is what expertise looks like");
    expect(html).toContain("when it's alive");
    expect(html).toContain("The network, live");
    expect(html).toContain(
      "Independent minds, each with an agent grown from what they know.",
    );
    expect(html).toContain('href="/network"');
    expect(html).toContain(">Meet the agents<");
    // The plugin default must be fully replaced, not appended.
    expect(html).not.toContain("The rhizome grows");
  });

  test("falls back to the plugin default copy when none is authored", () => {
    const html = render(<AgentProximityMapTemplate {...data} />);
    expect(html).toContain("The rhizome grows");
    expect(html).toContain('href="/agents"');
  });

  test("schema accepts optional authored copy fields (overlay-mergeable)", () => {
    const template = getTemplates()["proximity-map"];
    if (!template) throw new Error("proximity-map template not found");
    expect(
      template.schema.safeParse({ ...data, headingLead: "Custom" }).success,
    ).toBe(true);
  });

  test("registers an overlayFormatter that round-trips authored copy markdown", () => {
    const template = getTemplates()["proximity-map"];
    if (!template) throw new Error("proximity-map template not found");
    expect(template.overlayFormatter).toBeDefined();

    const copy = {
      kicker: "The network, live",
      headingLead: "This is what expertise looks like",
      headingAccent: "when it's alive",
      lede: "Independent minds.",
      ctaLabel: "Meet the agents",
      ctaHref: "/network",
    };
    const markdown = template.overlayFormatter?.format(copy) ?? "";
    // Authored as flat section-file headings, like every other content section.
    expect(markdown).toContain("## Kicker");
    expect(markdown).toContain("## Heading Lead");

    const parsed = template.overlayFormatter?.parse(markdown);
    expect(parsed).toMatchObject(copy);
  });

  test("registers a public datasource template and a CSP-safe runtime script asset", () => {
    const template = getTemplates()["proximity-map"];
    if (!template) throw new Error("proximity-map template not found");

    expect(template.dataSourceId).toBe("agent-discovery:proximity-map");
    expect(template.requiredPermission).toBe("public");
    expect(template.schema.safeParse(data).success).toBe(true);
    expect(template.runtimeScripts).toHaveLength(1);
    expect(template.runtimeScripts?.[0]?.defer).toBe(true);
    // A real file, not a data: URI — data: script srcs are blocked by any
    // script-src CSP, which would silently kill all map interactivity.
    const src = template.runtimeScripts?.[0]?.src ?? "";
    expect(src).toBe("/scripts/agent-proximity-map.js");
    expect(template.staticAssets?.[src]).toContain("[data-proximity-map]");
  });
});
