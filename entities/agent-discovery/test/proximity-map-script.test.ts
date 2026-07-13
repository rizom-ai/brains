import { describe, expect, test } from "bun:test";
import { proximityMapScript } from "../src/widgets/proximity-map-script";

describe("proximityMapScript", () => {
  test("supports pointer and keyboard cluster-aware inspection", () => {
    expect(proximityMapScript).toContain("[data-proximity-map]");
    expect(proximityMapScript).toContain("data-proximity-node-cluster");
    expect(proximityMapScript).toContain("data-proximity-cluster-id");
    expect(proximityMapScript).toContain("focusCluster");
    expect(proximityMapScript).toContain('addEventListener("mouseenter"');
    expect(proximityMapScript).toContain('addEventListener("focus"');
    expect(proximityMapScript).toContain('status === "archived"');
    // the chart column is gone — the map is the only interaction surface
    expect(proximityMapScript).not.toContain("data-proximity-constellation");
    expect(proximityMapScript).not.toContain("data-proximity-freeagents");
  });

  test("builds the structured tooltip with textContent, never markup injection", () => {
    expect(proximityMapScript).toContain("proximity-tooltip-name");
    expect(proximityMapScript).toContain("proximity-tooltip-meta");
    expect(proximityMapScript).toContain("proximity-tooltip-tag");
    expect(proximityMapScript).toContain("createElement");
    expect(proximityMapScript).toContain("textContent");
    expect(proximityMapScript).not.toContain("innerHTML");
  });
});
