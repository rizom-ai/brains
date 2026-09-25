import { atlasPosition, zoneSpread } from "./atlas-terrain";

/**
 * Territory label placement in the map's percentage space. Labels are
 * anchored at their bottom edge; widths are estimated from the name at the
 * phone label size, where a character takes the most of the map's width,
 * so text stays off marks and off each other at every width. Larger
 * territories choose first.
 */
const CHAR_WIDTH = 1.7;
const LABEL_HEIGHT = 3.2;
const GAP = 3.5;
/** A mark needs this much room under a label's baseline: its glyph plus a visible gap. */
const CLEARANCE = 2.5;
const STEP = 3;
const ATTEMPTS = 6;
/** A label is anchored by its bottom edge; leave room for its height and ascenders on a short phone map. */
const MAP_TOP = 7;
const MAP_BOTTOM = 96;

interface LabelZone {
  id: string;
  name: string;
  x: number;
  y: number;
  members: number;
}
interface LabelMark {
  x: number;
  y: number;
  zoneId: string | null;
}
interface LabelBox {
  x: number;
  halfWidth: number;
  bottom: number;
}

function overlapsMark(box: LabelBox, mark: LabelMark): boolean {
  const markY = atlasPosition(mark.y);
  return (
    Math.abs(atlasPosition(mark.x) - box.x) <= box.halfWidth &&
    markY >= box.bottom - LABEL_HEIGHT - 1 &&
    markY <= box.bottom + CLEARANCE
  );
}

function overlapsLabel(box: LabelBox, other: LabelBox): boolean {
  return (
    Math.abs(box.x - other.x) < box.halfWidth + other.halfWidth &&
    Math.abs(box.bottom - other.bottom) < LABEL_HEIGHT
  );
}

/** Label bottoms (percent of map height) keyed by zone id. */
export function layoutZoneLabels(
  zones: readonly LabelZone[],
  marks: readonly LabelMark[],
): Record<string, number> {
  const ordered = [...zones].sort(
    (a, b) => b.members - a.members || a.id.localeCompare(b.id),
  );

  return ordered.reduce<{ placed: LabelBox[]; tops: Record<string, number> }>(
    ({ placed, tops }, zone) => {
      const own = marks.filter((mark) => mark.zoneId === zone.id);
      const ys = own.map((mark) => atlasPosition(mark.y));
      const centre = atlasPosition(zone.y);
      const spread = zoneSpread(zone.members) * 0.6;
      const above = Math.min(centre - spread, ...ys) - GAP;
      const below = Math.max(centre + spread, ...ys) + GAP + LABEL_HEIGHT;
      const box = (bottom: number): LabelBox => ({
        x: atlasPosition(zone.x),
        halfWidth: (zone.name.length * CHAR_WIDTH) / 2 + 1,
        bottom,
      });
      const candidates = [
        // A territory at the top edge keeps its name above it, pinned to the edge.
        ...Array.from({ length: ATTEMPTS }, (_, k) =>
          Math.max(MAP_TOP, above - k * STEP),
        ),
        ...Array.from({ length: ATTEMPTS }, (_, k) => below + k * STEP),
      ].filter((bottom) => bottom <= MAP_BOTTOM);
      const chosen =
        candidates.find(
          (bottom) =>
            !marks.some((mark) => overlapsMark(box(bottom), mark)) &&
            !placed.some((other) => overlapsLabel(box(bottom), other)),
        ) ?? Math.max(MAP_TOP, above);
      return {
        placed: [...placed, box(chosen)],
        tops: { ...tops, [zone.id]: chosen },
      };
    },
    { placed: [], tops: {} },
  ).tops;
}
