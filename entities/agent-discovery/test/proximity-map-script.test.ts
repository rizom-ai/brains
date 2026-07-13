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
    expect(proximityMapScript).toContain("textContent");
    expect(proximityMapScript).toContain('status === "archived"');
  });
});
