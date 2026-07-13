import { describe, expect, test } from "bun:test";
import { proximityMapScript } from "../src/widgets/proximity-map-script";

describe("proximityMapScript", () => {
  test("supports pointer and keyboard cluster-aware inspection", () => {
    expect(proximityMapScript).toContain("[data-proximity-map]");
    expect(proximityMapScript).toContain("data-proximity-node-cluster");
    expect(proximityMapScript).toContain("data-proximity-cluster-id");
    expect(proximityMapScript).toContain("data-proximity-constellation");
    expect(proximityMapScript).toContain("focusCluster");
    expect(proximityMapScript).toContain('addEventListener("mouseenter"');
    expect(proximityMapScript).toContain('addEventListener("focus"');
    expect(proximityMapScript).toContain('status === "archived"');
  });

  test("wakes free agents from their chart row", () => {
    expect(proximityMapScript).toContain("data-proximity-freeagents");
    expect(proximityMapScript).toContain("focusFreeAgents");
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
