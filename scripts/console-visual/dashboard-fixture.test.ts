import { describe, expect, it } from "bun:test";
import { safeParseRuntimeDashboardWidgetData } from "@brains/plugins";
import { renderDashboardPageHtml } from "@brains/dashboard";
import { findCartesianMap } from "../../plugins/dashboard/src/render/public-card-data";
import { dashboardFixtureInput } from "./dashboard-fixture";

const widgetIds = [
  "agent-discovery:skills",
  "topics:topics-knowledge-map",
  "agent-discovery:agent-proximity",
];

function chatStatus(fixtureState: string | null): string | undefined {
  return dashboardFixtureInput(fixtureState).appInfo.interactions.find(
    (interaction) => interaction.id === "chat",
  )?.status;
}

describe("dashboardFixtureInput", () => {
  it("renders the default Dashboard with every public widget", () => {
    const input = dashboardFixtureInput(null);
    expect(Object.keys(input.widgets)).toEqual(widgetIds);
    expect(
      input.widgets["agent-discovery:agent-proximity"]?.component,
    ).toBeDefined();
    expect(chatStatus(null)).toBe("available");
    // The proximity widget draws itself from the source beside its view.
    for (const id of ["agent-discovery:skills", "topics:topics-knowledge-map"])
      expect(
        safeParseRuntimeDashboardWidgetData(input.widgets[id]?.data).success,
      ).toBe(true);
    expect(renderDashboardPageHtml(input)).toContain("Rover Collective");
  });

  it("treats an unknown fixture state as the default", () => {
    expect(dashboardFixtureInput("unknown")).toEqual(
      dashboardFixtureInput(null),
    );
  });

  it("builds a fresh input for each request, so fixture states never leak", () => {
    dashboardFixtureInput("waiting");
    dashboardFixtureInput("declarative-network");
    expect(Object.keys(dashboardFixtureInput(null).widgets)).toEqual(widgetIds);
    expect(chatStatus(null)).toBe("available");
  });

  it("crowds the atlas with twenty territories that keep the source zones first", () => {
    const sourceZones =
      findCartesianMap(dashboardFixtureInput(null).widgets)?.zones ?? [];
    const zones =
      findCartesianMap(dashboardFixtureInput("dense-map").widgets)?.zones ?? [];
    expect(sourceZones).toHaveLength(7);
    expect(zones).toHaveLength(20);
    expect(zones.slice(0, 7).map((zone) => zone.id)).toEqual(
      sourceZones.map((zone) => zone.id),
    );
    expect(zones[7]?.id).toBe(`${sourceZones[0]?.id}:dense-7`);
    expect(zones[19]?.label).toBe(
      `${sourceZones[5]?.label} — complete public territory 20`,
    );
    expect(zones[19]).toMatchObject({ x: 1, y: 1 });
    expect(new Set(zones.map((zone) => zone.id)).size).toBe(20);
  });

  it("renders the declarative network without its registered component", () => {
    const input = dashboardFixtureInput("declarative-network");
    expect(Object.keys(input.widgets)).toEqual(widgetIds);
    expect(
      input.widgets["agent-discovery:agent-proximity"]?.component,
    ).toBeUndefined();
  });

  it("waits with no widgets and its chat disabled", () => {
    const input = dashboardFixtureInput("waiting");
    expect(input.widgets).toEqual({});
    expect(chatStatus("waiting")).toBe("disabled");
    expect(
      input.appInfo.interactions.find((interaction) => interaction.id === "a2a")
        ?.status,
    ).toBe("available");
  });
});
