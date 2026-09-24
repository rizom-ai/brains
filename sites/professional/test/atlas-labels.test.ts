import { describe, expect, it } from "bun:test";
import { layoutZoneLabels } from "../src/lib/atlas-labels";
import { atlasPosition } from "../src/lib/atlas-terrain";

const zone = {
  id: "ecosystem",
  name: "Ecosystem architecture",
  x: 0.5,
  y: 0.5,
  members: 1,
};
const member = { x: 0.5, y: 0.5, zoneId: "ecosystem" };

const labelTop = (
  zones: Parameters<typeof layoutZoneLabels>[0],
  marks: Parameters<typeof layoutZoneLabels>[1],
  id: string,
): number => {
  const top = layoutZoneLabels(zones, marks)[id];
  if (top === undefined) throw new Error(`no label for ${id}`);
  return top;
};

describe("atlas zone labels", () => {
  it("sits just above the territory's highest mark", () => {
    const top = labelTop([zone], [member], "ecosystem");
    expect(top).toBeLessThan(atlasPosition(member.y));
    // Above the territory's upper slope, not floating far from it.
    expect(top).toBeGreaterThan(atlasPosition(member.y) - 10);
  });

  it("steps clear of a neighbouring territory's mark under its text", () => {
    const clear = labelTop([zone], [member], "ecosystem");
    const intruder = { x: 0.45, y: (clear - 1.5 - 6) / 88, zoneId: "other" };
    const moved = labelTop([zone], [member, intruder], "ecosystem");
    expect(moved).not.toBe(clear);
    const intruderY = atlasPosition(intruder.y);
    expect(moved - 4.2 <= intruderY && intruderY <= moved + 1).toBe(false);
  });

  it("keeps two neighbouring territory names apart", () => {
    const larger = { ...zone, members: 6 };
    const neighbour = {
      id: "institutions",
      name: "New institutions",
      x: 0.47,
      y: 0.49,
      members: 2,
    };
    const marks = [member, { x: 0.47, y: 0.49, zoneId: "institutions" }];
    const tops = layoutZoneLabels([neighbour, larger], marks);
    const a = tops["ecosystem"];
    const b = tops["institutions"];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.abs((a ?? 0) - (b ?? 0))).toBeGreaterThanOrEqual(3.2);
  });

  it("never leaves the top of the map", () => {
    const high = { ...member, y: 0 };
    expect(
      labelTop([{ ...zone, y: 0 }], [high], "ecosystem"),
    ).toBeGreaterThanOrEqual(4);
  });
});
