/**
 * Contour lines of a sampled field: marching squares traces iso-lines through
 * a grid of samples, and shared endpoints are stitched into polylines so the
 * SVG stays small. Pure and deterministic, so maps render at build time and
 * rebuilds do not churn.
 */

/** A window of the plane, divided into square-ish cells for sampling. */
export interface ContourGrid {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cells: number;
}

type Point = readonly [number, number];
type Segment = readonly [Point, Point];

const coordX = (grid: ContourGrid, index: number): number =>
  grid.x0 + ((grid.x1 - grid.x0) * index) / grid.cells;
const coordY = (grid: ContourGrid, index: number): number =>
  grid.y0 + ((grid.y1 - grid.y0) * index) / grid.cells;

/** The field's value at every grid point, row by row. */
export function sampleGrid(
  field: (x: number, y: number) => number,
  grid: ContourGrid,
): number[] {
  const samples = grid.cells + 1;
  return Array.from({ length: samples * samples }, (_, sample) =>
    field(
      coordX(grid, sample % samples),
      coordY(grid, Math.floor(sample / samples)),
    ),
  );
}

function cellSegments(
  heights: readonly number[],
  level: number,
  column: number,
  row: number,
  grid: ContourGrid,
): Segment[] {
  const samples = grid.cells + 1;
  const at = (c: number, r: number): number => heights[r * samples + c] ?? 0;
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

  const x0 = coordX(grid, column);
  const x1 = coordX(grid, column + 1);
  const y0 = coordY(grid, row);
  const y1 = coordY(grid, row + 1);
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

/** One SVG path per level, empty where the field never crosses it. */
export function traceContours(
  heights: readonly number[],
  levels: readonly number[],
  grid: ContourGrid,
): string[] {
  const cells = Array.from({ length: grid.cells * grid.cells }, (_, cell) => ({
    column: cell % grid.cells,
    row: Math.floor(cell / grid.cells),
  }));
  return levels.map((level) =>
    stitch(
      cells.flatMap(({ column, row }) =>
        cellSegments(heights, level, column, row, grid),
      ),
    )
      .map(polylinePath)
      .join(""),
  );
}
