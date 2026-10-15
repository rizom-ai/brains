import { describe, expect, it } from "bun:test";
import {
  parseDashboardView,
  parseStudioViewSource,
} from "../src/operator/operator-view-schemas";

/**
 * Dashboard and Studio views declare the same list, table, matrix, tabs, and
 * view-level identity rules. These pin each rule's issues — message, path, and
 * order — and assert both variants report them identically, so the two can
 * share one refinement without either drifting.
 */
const variants = [
  ["dashboard", parseDashboardView],
  ["studio", parseStudioViewSource],
] as const;

function issuesFor(
  parse: (input: unknown) => {
    success: boolean;
    issues?: readonly { path: readonly PropertyKey[]; message: string }[];
  },
  blocks: readonly unknown[],
): readonly { path: readonly PropertyKey[]; message: string }[] {
  const result = parse({ blocks });
  if (result.success) throw new Error("Expected the view to be rejected");
  return result.issues ?? [];
}

describe.each(variants)("the %s view's shared refinements", (_, parse) => {
  it("rejects repeated list item ids and filter values without an option", () => {
    const list = {
      type: "list",
      id: "reading",
      empty: "Nothing yet",
      filter: {
        label: "Status",
        defaultValue: "open",
        options: [{ value: "open", label: "Open" }],
      },
      items: [
        { id: "a", title: "First", filterValues: ["open", "all", "closed"] },
        { id: "a", title: "Repeat" },
        { id: "b", title: "Second", filterValues: ["gone"] },
      ],
    };

    expect(issuesFor(parse, [list])).toEqual([
      {
        path: ["blocks", 0, "items", 1, "id"],
        message: 'List item id "a" is duplicated',
      },
      {
        path: ["blocks", 0, "items", 0, "filterValues"],
        message: 'List item filter value "closed" has no matching option',
      },
      {
        path: ["blocks", 0, "items", 2, "filterValues"],
        message: 'List item filter value "gone" has no matching option',
      },
    ]);
  });

  it("rejects repeated list filter values and a default without an option", () => {
    const list = {
      type: "list",
      id: "reading",
      empty: "Nothing yet",
      filter: {
        label: "Status",
        defaultValue: "none",
        options: [
          { value: "open", label: "Open" },
          { value: "open", label: "Open again" },
        ],
      },
      items: [],
    };

    expect(issuesFor(parse, [list])).toEqual([
      {
        path: ["blocks", 0, "filter", "options", 1, "value"],
        message: 'List filter value "open" is duplicated',
      },
      {
        path: ["blocks", 0, "filter", "defaultValue"],
        message: 'List filter default "none" has no matching option',
      },
    ]);
  });

  it("rejects repeated table columns and rows, interleaving row and cell issues", () => {
    const table = {
      type: "table",
      id: "people",
      empty: "Nobody",
      filters: [
        { key: "status", label: "Status", values: [] },
        { key: "owner", label: "Owner", values: [] },
      ],
      columns: [
        { key: "title", label: "Title" },
        { key: "status", label: "Status" },
        { key: "title", label: "Title again" },
      ],
      rows: [
        { id: "r1", cells: { title: "A", extra: "x" } },
        { id: "r1", cells: { status: "open", other: "y" } },
      ],
    };

    expect(issuesFor(parse, [table])).toEqual([
      {
        path: ["blocks", 0, "columns", 2, "key"],
        message: 'Table column key "title" is duplicated',
      },
      {
        path: ["blocks", 0, "filters", 1, "key"],
        message: 'Table filter key "owner" has no matching column',
      },
      {
        path: ["blocks", 0, "rows", 0, "cells", "extra"],
        message: 'Table cell key "extra" has no matching column',
      },
      {
        path: ["blocks", 0, "rows", 1, "id"],
        message: 'Table row id "r1" is duplicated',
      },
      {
        path: ["blocks", 0, "rows", 1, "cells", "other"],
        message: 'Table cell key "other" has no matching column',
      },
    ]);
  });

  it("rejects repeated matrix item and cell ids", () => {
    const matrix = {
      type: "matrix",
      id: "board",
      cells: [
        {
          id: "c1",
          label: "One",
          empty: "Empty",
          items: [
            { id: "i", title: "Item" },
            { id: "i", title: "Item again" },
          ],
        },
        { id: "c1", label: "Two", empty: "Empty", items: [] },
      ],
    };

    expect(issuesFor(parse, [matrix])).toEqual([
      {
        path: ["blocks", 0, "cells", 0, "items", 1, "id"],
        message: 'Matrix item id "i" is duplicated',
      },
      {
        path: ["blocks", 0, "cells", 1, "id"],
        message: 'Matrix cell id "c1" is duplicated',
      },
    ]);
  });

  it("rejects repeated tab ids and a default tab without a match", () => {
    const tabs = {
      type: "tabs",
      id: "sections",
      label: "Sections",
      defaultTab: "missing",
      tabs: [
        { id: "a", label: "A", blocks: [] },
        { id: "a", label: "A again", blocks: [] },
      ],
    };

    expect(issuesFor(parse, [tabs])).toEqual([
      {
        path: ["blocks", 0, "tabs", 1, "id"],
        message: 'Tab id "a" is duplicated',
      },
      {
        path: ["blocks", 0, "defaultTab"],
        message: 'Default tab "missing" has no matching tab',
      },
    ]);
  });

  it("rejects repeated view block ids and ignores blocks without one", () => {
    const blocks = [
      { type: "links", id: "x", items: [] },
      { type: "links", items: [] },
      { type: "links", items: [] },
      { type: "links", id: "x", items: [] },
    ];

    expect(issuesFor(parse, blocks)).toEqual([
      {
        path: ["blocks", 3, "id"],
        message: 'Operator view block id "x" is duplicated',
      },
    ]);
  });
});

describe("the studio list and matrix extending the dashboard shapes", () => {
  const cell = { id: "c", label: "C", empty: "Empty", items: [] };

  it.each([
    ["list", { type: "list", id: "l", empty: "Empty", items: [], extra: 1 }],
    ["matrix", { type: "matrix", id: "m", cells: [cell], extra: 1 }],
    [
      "matrix cell",
      { type: "matrix", id: "m", cells: [{ ...cell, extra: 1 }] },
    ],
  ])("keeps the %s strict", (_, block) => {
    expect(parseStudioViewSource({ blocks: [block] }).success).toBe(false);
  });

  it("accepts the studio-only item fields", () => {
    const item = { id: "a", title: "A", actionsLabel: "More", actions: [] };
    const blocks = [
      { type: "list", id: "l", empty: "Empty", items: [item] },
      { type: "matrix", id: "m", cells: [{ ...cell, items: [item] }] },
    ];

    const result: unknown = parseStudioViewSource({ blocks });

    expect(result).toEqual({
      success: true,
      data: { blocks },
    });
  });
});

describe("the studio view's query refinements", () => {
  const controls = [
    { key: "status", label: "Status", options: [] },
    { key: "status", label: "Status again", options: [] },
  ];

  it("rejects repeated query block keys", () => {
    expect(
      issuesFor(parseStudioViewSource, [{ type: "query", id: "q", controls }]),
    ).toEqual([
      {
        path: ["blocks", 0, "controls", 1, "key"],
        message: 'Query key "status" is duplicated',
      },
    ]);
  });

  it("rejects repeated table query keys", () => {
    const table = {
      type: "table",
      id: "people",
      empty: "Nobody",
      query: { controls },
      columns: [{ key: "title", label: "Title" }],
      rows: [],
    };

    expect(issuesFor(parseStudioViewSource, [table])).toEqual([
      {
        path: ["blocks", 0, "query", "controls", 1, "key"],
        message: 'Query key "status" is duplicated',
      },
    ]);
  });
});

describe("the spatial block's refinements", () => {
  it("reports cartesian point, zone, and relationship issues in source order", () => {
    const spatial = {
      type: "spatial",
      layout: "cartesian",
      id: "map",
      label: "Map",
      description: "A map.",
      points: [
        { id: "p1", label: "P", category: "c", x: 0.1, y: 0.1, zoneId: "z9" },
        { id: "p1", label: "P again", category: "c", x: 0.2, y: 0.2 },
      ],
      zones: [
        { id: "z1", label: "Z", x: 0.5, y: 0.5, memberIds: ["ghost"] },
        { id: "p1", label: "Z point", x: 0.5, y: 0.5, memberIds: [] },
        { id: "z1", label: "Z again", x: 0.5, y: 0.5, memberIds: ["p1"] },
      ],
      relationships: [{ sourceId: "p1", targetId: "nowhere" }],
      legend: [],
    };

    expect(issuesFor(parseDashboardView, [spatial])).toEqual([
      {
        path: ["blocks", 0, "points", 1, "id"],
        message: 'Spatial point id "p1" is duplicated',
      },
      {
        path: ["blocks", 0, "zones", 0, "memberIds"],
        message: 'Spatial zone member "ghost" has no matching point',
      },
      {
        path: ["blocks", 0, "zones", 1, "id"],
        message: 'Spatial zone id "p1" is duplicated',
      },
      {
        path: ["blocks", 0, "zones", 2, "id"],
        message: 'Spatial zone id "z1" is duplicated',
      },
      {
        path: ["blocks", 0, "points", 0, "zoneId"],
        message: 'Spatial point zone "z9" has no matching zone',
      },
      {
        path: ["blocks", 0, "relationships", 0],
        message:
          "Spatial relationship endpoints must reference declared points or zones",
      },
    ]);
  });

  it("reports radial point, cluster, relationship, and strata issues in source order", () => {
    const point = { label: "P", kind: "agent", status: "active" };
    const spatial = {
      type: "spatial",
      layout: "radial",
      id: "radar",
      label: "Radar",
      description: "A radar.",
      centerLabel: "Center",
      centerKind: "centroid",
      points: [
        {
          ...point,
          id: "a",
          distance: 0.2,
          bearing: 10,
          relatedIds: ["ghost"],
        },
        { ...point, id: "a", distance: 0.3, bearing: 20 },
      ],
      clusters: [
        { id: "k", label: "K", memberIds: ["a", "ghost"] },
        { id: "k", label: "K again", memberIds: ["a", "a"] },
      ],
      relationships: [{ sourceId: "a", targetId: "ghost" }],
      strata: [
        { id: "near", label: "Near", maxDistance: 0.5 },
        { id: "far", label: "Far", maxDistance: 0.5 },
      ],
      legend: [],
    };

    expect(issuesFor(parseDashboardView, [spatial])).toEqual([
      {
        path: ["blocks", 0, "points", 1, "id"],
        message: 'Spatial point id "a" is duplicated',
      },
      {
        path: ["blocks", 0, "points", 0, "relatedIds"],
        message: 'Related point "ghost" is not declared',
      },
      {
        path: ["blocks", 0, "clusters", 0, "memberIds"],
        message: 'Spatial cluster member "ghost" has no matching point',
      },
      {
        path: ["blocks", 0, "clusters", 1, "id"],
        message: 'Spatial cluster id "k" is duplicated',
      },
      {
        path: ["blocks", 0, "relationships", 0],
        message:
          "Spatial relationship endpoints must reference declared points",
      },
      {
        path: ["blocks", 0, "strata", 1, "maxDistance"],
        message: "Radial strata must increase by maximum distance",
      },
    ]);
  });
});
