import {
  sampleGrid,
  traceContours,
  type ContourGrid,
} from "@brains/site-atlas";

/**
 * Radar echoes: the atlas's contour line, drawn only where agents return
 * signal. A constellation's echo stacks lines around its agents and pinches
 * along the threads between them; a lone agent gets a small island. Paths
 * are in the radar's 0–100 square and deterministic, so they render at
 * build time and rebuilds do not churn.
 */

interface Placed {
  id: string;
  x: number;
  y: number;
}

/** Low-frequency roughness, so echoes read as drawn rather than machined. */
function rough(x: number, y: number): number {
  return (
    1 +
    0.16 * Math.sin(0.23 * x + 1.3) * Math.cos(0.19 * y + 0.4) +
    0.1 * Math.sin(0.41 * x - 0.33 * y + 2.1) +
    0.06 * Math.cos(0.7 * y + 0.52 * x)
  );
}

const CONSTELLATION_LEVELS = [0.1, 0.2, 0.31, 0.43, 0.56, 0.7];
const CONSTELLATION_GRID: ContourGrid = {
  x0: -8,
  y0: -8,
  x1: 108,
  y1: 108,
  cells: 150,
};
/** Samples along each thread; the echo narrows towards the middle. */
const THREAD_SAMPLES = 7;

interface Blob {
  x: number;
  y: number;
  spread: number;
  weight: number;
}

function strength(blobs: readonly Blob[], x: number, y: number): number {
  return blobs.reduce(
    (value, blob) =>
      value +
      blob.weight *
        Math.exp(
          -((x - blob.x) ** 2 + (y - blob.y) ** 2) / (2 * blob.spread ** 2),
        ),
    0,
  );
}

/** Stacked lines, outermost first, around a constellation's agents and threads. */
export function constellationEcho(
  members: readonly Placed[],
  links: ReadonlyArray<{ from: string; to: string }>,
): string[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const blobs: Blob[] = [
    ...members.map((member) => ({
      x: member.x,
      y: member.y,
      spread: 5.4,
      weight: 1,
    })),
    ...links.flatMap(({ from, to }) => {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a || !b) return [];
      return Array.from({ length: THREAD_SAMPLES }, (_, index) => {
        const along = (index + 1) / (THREAD_SAMPLES + 1);
        const pinch = Math.sin(along * Math.PI);
        return {
          x: a.x + (b.x - a.x) * along,
          y: a.y + (b.y - a.y) * along,
          spread: 4.6 - 1.2 * pinch,
          weight: 0.78 - 0.18 * pinch,
        };
      });
    }),
  ];
  return traceContours(
    sampleGrid(
      (x, y) => rough(x, y) * strength(blobs, x, y),
      CONSTELLATION_GRID,
    ),
    CONSTELLATION_LEVELS,
    CONSTELLATION_GRID,
  );
}

/** A small island of rings around an agent outside any constellation; fewer while it awaits review. */
export function loneEcho(agent: Placed, pending: boolean): string[] {
  const grid: ContourGrid = {
    x0: agent.x - 13,
    y0: agent.y - 13,
    x1: agent.x + 13,
    y1: agent.y + 13,
    cells: 60,
  };
  const island = (x: number, y: number): number =>
    rough(x * 1.7, y * 1.7) *
    Math.exp(-((x - agent.x) ** 2 + (y - agent.y) ** 2) / (2 * 3.1 ** 2));
  return traceContours(
    sampleGrid(island, grid),
    pending ? [0.3, 0.62] : [0.18, 0.4, 0.66],
    grid,
  );
}
