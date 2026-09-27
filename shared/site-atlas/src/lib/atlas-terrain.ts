/**
 * Atlas terrain: topographic contours for the homepage map.
 *
 * Territories and published items raise a height field in the map's
 * 0–100 viewBox; marching squares traces iso-lines through it and the
 * segments are stitched into polylines so the SVG stays small. Pure and
 * deterministic, so it renders at build time and rebuilds do not churn.
 */

import { sampleGrid, traceContours, type ContourGrid } from "./contours";

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

/** Unit coordinates sit inside a margin so no mark touches the map's edge. */
const INSET = 6;
const SPAN = 100 - 2 * INSET;
const GRID = 64;
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

/** The terrain's sampling window: the whole viewBox. */
const TERRAIN_GRID: ContourGrid = {
  x0: 0,
  y0: 0,
  x1: 100,
  y1: 100,
  cells: GRID,
};

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

  return sampleGrid((x, y) => {
    return bumps.reduce((height, bump) => {
      const distanceSquared = (x - bump.x) ** 2 + (y - bump.y) ** 2;
      // Beyond ~4 sigma a bump contributes nothing visible.
      if (distanceSquared > bump.twoSigmaSquared * 8) return height;
      return (
        height + bump.weight * Math.exp(-distanceSquared / bump.twoSigmaSquared)
      );
    }, 0);
  }, TERRAIN_GRID);
}

export function buildAtlasTerrain(input: AtlasTerrainInput): AtlasContour[] {
  const heights = sampleField(input);
  const peak = heights.reduce((max, height) => Math.max(max, height), 0);
  const levels = Array.from(
    { length: MAX_LEVELS },
    (_, step) => FIRST_LEVEL + step * LEVEL_STEP,
  ).filter((level) => level < peak);
  const paths = traceContours(heights, levels, TERRAIN_GRID);

  return levels.flatMap((level, step) => {
    const d = paths[step] ?? "";
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
