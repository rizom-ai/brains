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
  const top = layoutZoneLabels(zones, marks)[id]?.bottom;
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

  it("never sits on a mark just under its baseline, even at the top edge", () => {
    // The territory's top mark sits right where a top-edge label would rest.
    const top = { x: 0.5, y: (9 - 6) / 88, zoneId: "ecosystem" };
    const bottom = labelTop([{ ...zone, y: 0.05 }], [top, member], "ecosystem");
    const markY = atlasPosition(top.y);
    expect(markY >= bottom - 4.2 && markY <= bottom + 2.5).toBe(false);
  });

  it("sizes names for the narrow phone map, where each character takes more of the width", () => {
    // A mark 13% right of centre sits under the text of a 22-character name on a 390px map.
    const beside = { x: 0.5 + 13 / 88, y: 0.5, zoneId: "other" };
    const clear = labelTop([zone], [member], "ecosystem");
    const withNeighbour = { ...beside, y: (clear - 1.5 - 6) / 88 };
    expect(labelTop([zone], [member, withNeighbour], "ecosystem")).not.toBe(
      clear,
    );
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
    const a = tops["ecosystem"]?.bottom;
    const b = tops["institutions"]?.bottom;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.abs((a ?? 0) - (b ?? 0))).toBeGreaterThanOrEqual(3.2);
  });

  it("keeps a name at the map's edge inside the map", () => {
    const edge = {
      ...zone,
      id: "positioning",
      name: "Professional positioning",
      x: 0.99,
    };
    const placed = layoutZoneLabels(
      [edge],
      [{ ...member, zoneId: "positioning", x: 0.99 }],
    )["positioning"];
    if (!placed) throw new Error("no label");
    const halfWidth = (edge.name.length * 1.7) / 2;
    expect(placed.left + halfWidth).toBeLessThanOrEqual(100);
    expect(placed.left - halfWidth).toBeGreaterThanOrEqual(0);
  });

  it("keeps the whole name inside the map, even on a short phone map", () => {
    const high = { ...member, y: 0 };
    expect(
      labelTop([{ ...zone, y: 0 }], [high], "ecosystem"),
    ).toBeGreaterThanOrEqual(7);
  });
});
