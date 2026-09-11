/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import { KnowledgeMapPanel } from "../src/render/knowledge-map";
import { ProximityMapPanel } from "../src/render/proximity-map";
import { mapLegendPresentation } from "../src/render/map-legend";
import type {
  CartesianMapBlock,
  RadialMapBlock,
} from "../src/render/public-card-data";

test("legend presentation remains host-owned with explicit markers and existing category precedence", () => {
  expect(mapLegendPresentation({ label: "Topic zones", tone: "good" })).toEqual(
    { marker: "dashed-ring", tone: "secondary" },
  );
  expect(mapLegendPresentation({ label: "Constellations" })).toEqual({
    marker: "dashed-ring",
    tone: "secondary",
  });
  expect(mapLegendPresentation({ label: "Published", tone: "good" })).toEqual({
    marker: "dot",
    tone: "warn",
  });
  expect(
    mapLegendPresentation({ label: "Approved agents", tone: "good" }),
  ).toEqual({ marker: "dot", tone: "warn" });
  expect(
    mapLegendPresentation({ label: "Published topic skills", tone: "warn" }),
  ).toEqual({ marker: "dot", tone: "good" });
  expect(mapLegendPresentation({ label: "Discovered", tone: "warn" })).toEqual({
    marker: "dot",
    tone: "warn",
  });
  expect(mapLegendPresentation({ label: "Available", tone: "good" })).toEqual({
    marker: "dot",
    tone: "good",
  });
  expect(mapLegendPresentation({ label: "Sources", tone: "unknown" })).toEqual({
    marker: "ring",
    tone: "neutral",
  });
});

function cartesian(): CartesianMapBlock {
  return {
    type: "spatial",
    layout: "cartesian",
    id: "map",
    label: "Public map <script>",
    description: "Source description stays exact.",
    points: [
      {
        id: "source-a",
        label: "A",
        category: "published",
        x: 0.25,
        y: 0.4,
        zoneId: "zone-20",
      },
      {
        id: "source-b",
        label: "B",
        category: "skill",
        x: 0.3,
        y: 0.45,
        zoneId: "zone-20",
      },
    ],
    zones: Array.from({ length: 20 }, (_, index) => ({
      id: `zone-${index + 1}`,
      label: `Region ${String(index + 1).padStart(2, "0")}`,
      x: 0.5,
      y: 0.5,
      memberIds: Array.from(
        { length: index + 1 },
        (_, member) => `source-${member}`,
      ),
    })),
  };
}

test("knowledge point categories keep explicit paint, radii, and full unknown values", async () => {
  const cases = [
    { category: "published", radius: "3.1", paint: "rgb(200,140,40)" },
    { category: "skill", radius: "2.7", paint: "rgb(40,140,80)" },
    { category: "high-signal", radius: "2.2", paint: "none" },
    { category: "custom <category>", radius: "1.7", paint: "rgb(150,150,150)" },
  ];
  const window = new Window();
  try {
    const doc = window.document;
    doc.head.innerHTML = `<style>:root{--console-warn:rgb(200,140,40);--console-ok:rgb(40,140,80);--console-text-faint:rgb(150,150,150)}${operatorViewStylexCSS}</style>`;
    doc.body.innerHTML = renderToStaticMarkup(
      <KnowledgeMapPanel
        entityTotal={4}
        block={{
          ...cartesian(),
          zones: [],
          points: cases.map((item, index) => ({
            id: `source:${index}`,
            label: `Exact source ${index}`,
            category: item.category,
            x: 0.5,
            y: 0.5,
          })),
        }}
      />,
    );
    const points = doc.querySelectorAll(".knowledge-point");
    expect(points).toHaveLength(4);
    for (const [index, item] of cases.entries()) {
      const point = points[index],
        mark = point?.querySelector("circle");
      if (!point || !mark) throw Error("Missing source point");
      expect(point.querySelector("title")?.textContent).toBe(
        `Exact source ${index} · ${item.category}`,
      );
      expect(mark.getAttribute("r")).toBe(item.radius);
      expect(window.getComputedStyle(mark).getPropertyValue("fill")).toBe(
        item.paint,
      );
    }
    expect(doc.querySelector("script")).toBeNull();
  } finally {
    await window.happyDOM.close();
  }
});

test("map summaries keep full source totals while host geometry and index retain their independent limits", async () => {
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <KnowledgeMapPanel block={cartesian()} entityTotal={236} />,
    );
    const doc = window.document;
    expect(
      [...doc.querySelectorAll(".knowledge-atlas-summary dd")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["236", "2", "20"]);
    expect(
      doc.querySelector('.knowledge-atlas-summary p[data-tone="good"]')
        ?.textContent,
    ).toBe("Current");
    expect(doc.querySelectorAll("[data-knowledge-zone]")).toHaveLength(18);
    expect(doc.querySelectorAll("[data-knowledge-zone-ref]")).toHaveLength(8);
    expect(doc.querySelectorAll(".knowledge-zone-label")).toHaveLength(7);
    expect(doc.querySelectorAll(".knowledge-point")).toHaveLength(2);
    expect(
      doc
        .querySelector('[aria-pressed="true"]')
        ?.getAttribute("data-knowledge-zone-ref"),
    ).toBe("zone-20");
    expect(
      doc.querySelector("[data-map-index-remainder]")?.textContent,
    ).toContain("12 smaller territories");
    expect(doc.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 820 480",
    );
    expect(doc.querySelector("svg title")?.textContent).toBe(
      "Public map <script>",
    );
    expect(doc.querySelector("svg desc")?.textContent).toBe(
      "Source description stays exact.",
    );
    expect(doc.querySelector("script")).toBeNull();
    for (const anchor of doc.querySelectorAll(".knowledge-zone-anchor")) {
      expect(Number.isFinite(Number(anchor.getAttribute("cx")))).toBe(true);
      expect(Number.isFinite(Number(anchor.getAttribute("cy")))).toBe(true);
    }
  } finally {
    await window.happyDOM.abort();
  }
});

test("absent maps remain truthful empty states while a supplied empty projection remains current", async () => {
  const window = new Window();
  try {
    const doc = window.document;
    doc.body.innerHTML = renderToStaticMarkup(
      <>
        <KnowledgeMapPanel block={undefined} entityTotal={0} />
        <ProximityMapPanel block={undefined} />
      </>,
    );
    expect(doc.querySelectorAll(".map-empty")).toHaveLength(2);
    expect(doc.querySelectorAll("svg")).toHaveLength(0);
    expect(
      [...doc.querySelectorAll(".knowledge-atlas-summary dd")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["0", "0", "0"]);
    expect(
      doc.querySelector('.knowledge-atlas-summary p[data-tone="warn"]')
        ?.textContent,
    ).toBe("Waiting");
    expect(doc.body.textContent).toContain("will grow as topics are indexed");
    expect(doc.body.textContent).toContain(
      "will appear as approved peers are indexed",
    );
    const block = cartesian();
    block.points = [];
    block.zones = [];
    doc.body.innerHTML = renderToStaticMarkup(
      <KnowledgeMapPanel block={block} entityTotal={0} />,
    );
    expect(
      doc.querySelector('.knowledge-atlas-summary p[data-tone="good"]')
        ?.textContent,
    ).toBe("Current");
    expect(doc.querySelector("svg")).not.toBeNull();
    expect(doc.querySelector(".map-empty")).toBeNull();
  } finally {
    await window.happyDOM.abort();
  }
});

test("declarative proximity preserves geometry, statuses, descriptions, and active counts", async () => {
  const block: RadialMapBlock = {
    type: "spatial",
    layout: "radial",
    id: "network",
    label: "Public network",
    description: "Exact network description",
    centerLabel: "Identity",
    centerKind: "identity",
    points: [
      {
        id: "active",
        label: "Active",
        kind: "person",
        status: "approved",
        distance: 0,
        bearing: 0,
      },
      {
        id: "archived",
        label: "Archived",
        kind: "person",
        status: "archived",
        distance: 1,
        bearing: 180,
      },
    ],
    strata: [{ id: "near", label: "Near", maxDistance: 0.5 }],
  };
  const window = new Window();
  try {
    const doc = window.document;
    doc.body.innerHTML = renderToStaticMarkup(
      <ProximityMapPanel block={block} />,
    );
    expect(doc.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 980 560",
    );
    expect(doc.querySelector("svg desc")?.textContent).toBe(
      "Exact network description",
    );
    expect(doc.querySelectorAll("[data-proximity-status]")).toHaveLength(2);
    const active = doc.querySelector(
      '[data-proximity-status="approved"] .proximity-node-mark',
    );
    expect(active?.getAttribute("cx")).toBe("546");
    expect(active?.getAttribute("cy")).toBe("280");
    expect(doc.querySelector(".map-live")?.textContent).toContain(
      "1 agent · 0 constellations",
    );
  } finally {
    await window.happyDOM.abort();
  }
});

test("proximity paint keeps sighting precedence, archived state, and unknown source statuses", async () => {
  const cases = [
    {
      kind: "person",
      status: "approved",
      paint: "rgb(200,140,40)",
      shape: "circle",
      radius: "5.5",
      dimmed: false,
    },
    {
      kind: "person",
      status: "discovered",
      paint: "rgb(80,60,120)",
      shape: "circle",
      radius: "4.5",
      dimmed: false,
    },
    {
      kind: "person",
      status: "archived",
      paint: "rgb(120,120,120)",
      shape: "circle",
      radius: "4.5",
      dimmed: true,
    },
    {
      kind: "person",
      status: "future <state>",
      paint: "rgb(120,120,120)",
      shape: "circle",
      radius: "4.5",
      dimmed: false,
    },
    {
      kind: "sighting",
      status: "approved",
      paint: "rgb(80,60,120)",
      shape: "path",
      radius: null,
      dimmed: false,
    },
    {
      kind: "sighting",
      status: "archived",
      paint: "rgb(80,60,120)",
      shape: "path",
      radius: null,
      dimmed: false,
    },
  ];
  const window = new Window();
  try {
    const doc = window.document;
    doc.head.innerHTML = `<style>:root{--console-warn:rgb(200,140,40);--console-secondary:rgb(80,60,120);--console-text-muted:rgb(120,120,120)}${operatorViewStylexCSS}</style>`;
    doc.body.innerHTML = renderToStaticMarkup(
      <ProximityMapPanel
        block={{
          type: "spatial",
          layout: "radial",
          id: "network",
          label: "Network",
          centerKind: "identity",
          centerLabel: "Self",
          strata: [],
          points: cases.map((item, index) => ({
            id: `source:${index}`,
            label: `Exact peer ${index}`,
            kind: item.kind,
            status: item.status,
            tags: ["Exact tag <script>"],
            distance: 0.5,
            bearing: index * 30,
          })),
        }}
      />,
    );
    const nodes = doc.querySelectorAll(".proximity-node");
    expect(nodes).toHaveLength(cases.length);
    for (const [index, item] of cases.entries()) {
      const node = nodes[index],
        mark = node?.querySelector(".proximity-node-mark");
      if (!node || !mark) throw Error("Missing source node");
      expect(node.getAttribute("data-proximity-status")).toBe(item.status);
      expect(node.querySelector("title")?.textContent).toBe(
        `Exact peer ${index} · ${item.status} · Exact tag <script>`,
      );
      expect(mark.tagName.toLowerCase()).toBe(item.shape);
      expect(mark.getAttribute("r")).toBe(item.radius);
      expect(window.getComputedStyle(mark).getPropertyValue("fill")).toBe(
        item.paint,
      );
      if (item.dimmed)
        expect(Number.parseFloat(window.getComputedStyle(node).opacity)).toBe(
          0.25,
        );
      else expect(["", "1"]).toContain(window.getComputedStyle(node).opacity);
    }
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector(".map-live")?.textContent).toContain("4 agents");
  } finally {
    await window.happyDOM.close();
  }
});

test("registered network visualizations still own their rendering and source payload", () => {
  const html = renderToStaticMarkup(
    <ProximityMapPanel
      block={undefined}
      widget={{
        widget: {
          id: "network",
          pluginId: "agent-discovery",
          title: "Network",
          group: "network",
          section: "primary",
          priority: 1,
          rendererName: "RegisteredMap",
          visibility: "public",
        },
        data: { source: { exact: "payload" } },
        component: ({ data }) => (
          <div data-registered-map>{JSON.stringify(data)}</div>
        ),
      }}
    />,
  );
  expect(html).toContain("data-registered-map");
  expect(html).toContain("&quot;exact&quot;:&quot;payload&quot;");
  expect(html).not.toContain("proximity-map-field");
});
