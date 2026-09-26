/**
 * Atlas terrain: topographic contours for the homepage map.
 *
 * Territories and published items raise a height field in the map's
 * 0–100 viewBox; marching squares traces iso-lines through it and the
 * segments are stitched into polylines so the SVG stays small. Pure and
 * deterministic, so it renders at build time and rebuilds do not churn.
 */

export interface AtlasTerrainInput {
  zones: ReadonlyArray<{ x: number; y: number; members: number }>;
  items: ReadonlyArray<{ x: number; y: number }>;
}

export interface AtlasContour {
  /** Position in the level sequence, from the lowest ring upward. */
  step: number;
  level: number;
  /** Every fourth ring is drawn heavier, as index contours are on a survey map. */
  index: boolean;
  opacity: number;
  d: string;
}

type Point = readonly [number, number];
type Segment = readonly [Point, Point];

/** Unit coordinates sit inside a margin so no mark touches the map's edge. */
const INSET = 6;
const SPAN = 100 - 2 * INSET;
const GRID = 64;
const SAMPLES = GRID + 1;
const FIRST_LEVEL = 0.07;
const LEVEL_STEP = 0.075;
const MAX_LEVELS = 22;
const ITEM_SPREAD = 1.8;
const ITEM_WEIGHT = 0.2;

export function atlasPosition(value: number): number {
  return INSET + Math.min(1, Math.max(0, value)) * SPAN;
}

/** A territory's spread in viewBox units: fuller territories rise wider. */
export function zoneSpread(members: number): number {
  return 6 + 1.5 * Math.sqrt(members);
}

const coord = (index: number): number => (index * 100) / GRID;

function sampleField(input: AtlasTerrainInput): number[] {
  const bumps = [
    ...input.zones.map((zone) => ({
      x: atlasPosition(zone.x),
      y: atlasPosition(zone.y),
      spread: zoneSpread(zone.members),
      weight: 0.75 + 0.1 * Math.min(zone.members, 5),
    })),
    ...input.items.map((item) => ({
      x: atlasPosition(item.x),
      y: atlasPosition(item.y),
      spread: ITEM_SPREAD,
      weight: ITEM_WEIGHT,
    })),
  ].map((bump) => ({ ...bump, twoSigmaSquared: 2 * bump.spread ** 2 }));

  return Array.from({ length: SAMPLES * SAMPLES }, (_, sample) => {
    const x = coord(sample % SAMPLES);
    const y = coord(Math.floor(sample / SAMPLES));
    return bumps.reduce((height, bump) => {
      const distanceSquared = (x - bump.x) ** 2 + (y - bump.y) ** 2;
      // Beyond ~4 sigma a bump contributes nothing visible.
      if (distanceSquared > bump.twoSigmaSquared * 8) return height;
      return (
        height + bump.weight * Math.exp(-distanceSquared / bump.twoSigmaSquared)
      );
    }, 0);
  });
}

function cellSegments(
  heights: readonly number[],
  level: number,
  column: number,
  row: number,
): Segment[] {
  const at = (c: number, r: number): number => heights[r * SAMPLES + c] ?? 0;
  const topLeft = at(column, row);
  const topRight = at(column + 1, row);
  const bottomRight = at(column + 1, row + 1);
  const bottomLeft = at(column, row + 1);
  const code =
    (topLeft >= level ? 8 : 0) |
    (topRight >= level ? 4 : 0) |
    (bottomRight >= level ? 2 : 0) |
    (bottomLeft >= level ? 1 : 0);
  if (code === 0 || code === 15) return [];

  const x0 = coord(column);
  const x1 = coord(column + 1);
  const y0 = coord(row);
  const y1 = coord(row + 1);
  const along = (from: number, to: number): number =>
    (level - from) / (to - from);
  const top = (): Point => [x0 + (x1 - x0) * along(topLeft, topRight), y0];
  const right = (): Point => [
    x1,
    y0 + (y1 - y0) * along(topRight, bottomRight),
  ];
  const bottom = (): Point => [
    x0 + (x1 - x0) * along(bottomLeft, bottomRight),
    y1,
  ];
  const left = (): Point => [x0, y0 + (y1 - y0) * along(topLeft, bottomLeft)];
  const centreHigh =
    (topLeft + topRight + bottomRight + bottomLeft) / 4 >= level;

  switch (code) {
    case 1:
    case 14:
      return [[left(), bottom()]];
    case 2:
    case 13:
      return [[bottom(), right()]];
    case 3:
    case 12:
      return [[left(), right()]];
    case 4:
    case 11:
      return [[top(), right()]];
    case 6:
    case 9:
      return [[top(), bottom()]];
    case 7:
    case 8:
      return [[left(), top()]];
    // Saddles: the averaged centre decides which diagonal stays connected.
    case 5:
      return centreHigh
        ? [
            [left(), top()],
            [bottom(), right()],
          ]
        : [
            [left(), bottom()],
            [top(), right()],
          ];
    case 10:
      return centreHigh
        ? [
            [top(), right()],
            [left(), bottom()],
          ]
        : [
            [left(), top()],
            [bottom(), right()],
          ];
    default:
      return [];
  }
}

const pointKey = (point: Point): string =>
  `${point[0].toFixed(3)},${point[1].toFixed(3)}`;

/** Joins shared endpoints so each ring becomes one polyline, not many dashes. */
function stitch(segments: readonly Segment[]): Point[][] {
  const byEndpoint = new Map<string, number[]>();
  segments.forEach(([from, to], index) =>
    [from, to].forEach((point) => {
      const key = pointKey(point);
      byEndpoint.set(key, [...(byEndpoint.get(key) ?? []), index]);
    }),
  );
  const used = new Set<number>();

  const grow = (line: Point[], atEnd: boolean): Point[] => {
    const tip = atEnd ? line[line.length - 1] : line[0];
    if (!tip) return line;
    const next = (byEndpoint.get(pointKey(tip)) ?? []).find(
      (index) => !used.has(index),
    );
    const segment = next === undefined ? undefined : segments[next];
    if (next === undefined || !segment) return line;
    used.add(next);
    const other =
      pointKey(segment[0]) === pointKey(tip) ? segment[1] : segment[0];
    if (atEnd) line.push(other);
    else line.unshift(other);
    return grow(line, atEnd);
  };

  return segments.flatMap((segment, index) => {
    if (used.has(index)) return [];
    used.add(index);
    return [grow(grow([segment[0], segment[1]], true), false)];
  });
}

const round = (value: number): number => Math.round(value * 10) / 10;

function polylinePath(line: readonly Point[]): string {
  return line
    .map((point) => [round(point[0]), round(point[1])] as const)
    .filter(
      (point, index, all) =>
        index === 0 ||
        point[0] !== all[index - 1]?.[0] ||
        point[1] !== all[index - 1]?.[1],
    )
    .map((point, index) => `${index === 0 ? "M" : "L"}${point[0]} ${point[1]}`)
    .join("");
}

export function buildAtlasTerrain(input: AtlasTerrainInput): AtlasContour[] {
  const heights = sampleField(input);
  const peak = heights.reduce((max, height) => Math.max(max, height), 0);
  const levels = Array.from(
    { length: MAX_LEVELS },
    (_, step) => FIRST_LEVEL + step * LEVEL_STEP,
  ).filter((level) => level < peak);
  const cells = Array.from({ length: GRID * GRID }, (_, cell) => ({
    column: cell % GRID,
    row: Math.floor(cell / GRID),
  }));

  return levels.flatMap((level, step) => {
    const segments = cells.flatMap(({ column, row }) =>
      cellSegments(heights, level, column, row),
    );
    const d = stitch(segments).map(polylinePath).join("");
    if (!d) return [];
    const index = step % 4 === 3;
    const rise = 0.16 + (0.5 * step) / Math.max(1, levels.length - 1);
    return [
      {
        step,
        level: Math.round(level * 1000) / 1000,
        index,
        opacity:
          Math.round(Math.min(1, index ? rise * 1.6 : rise) * 1000) / 1000,
        d,
      },
    ];
  });
}
