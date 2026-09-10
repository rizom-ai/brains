import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";

/** Synthetic renderer inputs; no service calls or source geometry reinterpretation. */
export const spatialFixtures: Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "spatial" }
>[] = [
  {
    type: "spatial",
    layout: "cartesian",
    id: "cartesian-probe",
    label: "Cartesian fixture",
    description: "Exact cartesian description α—/",
    points: [
      { id: "a", label: "First point", category: "topic", x: 0.25, y: 0.75 },
      { id: "b", label: "Second point", category: "topic", x: 0.75, y: 0.25 },
    ],
    zones: [
      { id: "zone", label: "Zone", x: 0.5, y: 0.5, memberIds: ["a", "b"] },
    ],
    relationships: [
      { sourceId: "a", targetId: "b", tone: "good" },
      { sourceId: "a", targetId: "missing", tone: "error" },
    ],
    legend: [{ label: "Topic" }],
  },
  {
    type: "spatial",
    layout: "radial",
    id: "radial-probe",
    label: "Radial fixture",
    description: "Exact radial description α—/",
    centerLabel: "Centerα".repeat(15),
    centerKind: "identity",
    points: [
      {
        id: "north",
        label: "North",
        kind: "agent",
        status: "ready",
        distance: 1,
        bearing: 0,
        relatedIds: ["east"],
        details: ["Exact detail α—/"],
      },
      {
        id: "east",
        label: "East",
        kind: "agent",
        status: "waiting",
        distance: 0.5,
        bearing: 90,
      },
      {
        id: "south",
        label: "South",
        kind: "agent",
        status: "unknown",
        distance: 0.5,
        bearing: 180,
      },
    ],
    strata: [
      { id: "near", label: "Near", maxDistance: 0.5 },
      { id: "far", label: "Far", maxDistance: 1 },
    ],
    relationships: [{ sourceId: "north", targetId: "east", tone: "warn" }],
    legend: [{ label: "Agent" }],
  },
];
