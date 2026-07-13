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
  distanceRange: { min: 0.25, max: 0.5 },
  pendingCount: 1,
};

describe("AgentProximityMapTemplate", () => {
  test("renders the shared map in its paper site climate", () => {
    const html = render(<AgentProximityMapTemplate {...data} />);

    expect(html).toContain('class="agent-proximity-site"');
    expect(html).toContain("The rhizome grows");
    expect(html).toContain("proximity-field--site");
    expect(html).toContain('viewBox="40 0 680 520"');
    expect(html).toContain("research · 2");
    expect(html).toContain("archived traces");
    expect(html).toContain("pending semantic indexing");
    expect(html).toContain('href="/agents"');
    expect(html).not.toContain("proximity-hud-title");
  });

  test("renders byte-identically across consecutive builds", () => {
    expect(render(<AgentProximityMapTemplate {...data} />)).toBe(
      render(<AgentProximityMapTemplate {...data} />),
    );
  });

  test("registers a public datasource template and scoped runtime script", () => {
    const template = getTemplates()["agent-proximity-map"];
    if (!template) throw new Error("agent-proximity-map template not found");

    expect(template.dataSourceId).toBe("agent-discovery:proximity-map");
    expect(template.requiredPermission).toBe("public");
    expect(template.schema.safeParse(data).success).toBe(true);
    expect(template.runtimeScripts).toHaveLength(1);
    expect(template.runtimeScripts?.[0]?.defer).toBe(true);
    expect(template.runtimeScripts?.[0]?.src).toStartWith(
      "data:text/javascript;charset=utf-8,",
    );
    expect(
      decodeURIComponent(template.runtimeScripts?.[0]?.src ?? ""),
    ).toContain("[data-proximity-map]");
  });
});
