/**
 * The Foundation's drawing: institutions built for a different century, the
 * research that loosens them, the pattern by which people are connected, the
 * series city by city, and the two streams that fund it.
 */
import {
  gathered,
  organism,
  placed,
  ring,
  scatter,
  type Organism,
} from "./organism";

const C = 300;
const grid = Array.from({ length: 16 }, (_, i): [number, number] => [
  156 + (i % 4) * 96,
  156 + Math.floor(i / 4) * 96,
]);
const loose = grid.map(([x, y], i): [number, number] => [
  x + (scatter(i) - 0.5) * 90,
  y + (scatter(i + 20) - 0.5) * 90,
]);
const essay0: [number, number] = [140, 360];
const essay1: [number, number] = [C, 240];
const essay2: [number, number] = [460, 330];
const pattern = ring(9, 172, -Math.PI / 2).map(
  ([x, y], i): [number, number] => [
    x + (scatter(i) - 0.5) * 50,
    y + (scatter(i + 20) - 0.5) * 50,
  ],
);
const city0: [number, number] = [130, 320];
const city1: [number, number] = [C, 250];
const city2: [number, number] = [470, 320];
const cities: [number, number][] = [city0, city1, city2];
const crowd = (c: [number, number], seed: number): [number, number][] =>
  Array.from({ length: 16 }, (_, i) => {
    const a = scatter(i + seed) * Math.PI * 2;
    const r = 20 + scatter(i + seed + 7) * 34;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
const crowds = cities.flatMap((c, k) => crowd(c, k * 40));
const lattice = grid
  .flatMap((_, i) => [
    i % 4 < 3 && scatter(i) > 0.22 ? `h${i}` : null,
    i < 12 && scatter(i + 50) > 0.22 ? `v${i}` : null,
  ])
  .filter((id): id is string => id !== null);

export const foundationOrganism: Organism = organism({
  id: "foundation-org",
  kinds: {
    E0: "lantern",
    E1: "lantern",
    E2: "lantern",
    R: "lantern",
    C0: "lantern",
    C1: "lantern",
    C2: "lantern",
  },
  stages: [
    // Institutions: a rigid lattice, some links already broken.
    { ...placed(grid, "G", 4, 0.9) },
    // The research: the lattice loosens and fades; three essays light as one line of thought.
    {
      ...placed(loose, "G", 3.5, 0.35),
      E0: [...essay0, 8, 1],
      E1: [...essay1, 8, 1],
      E2: [...essay2, 8, 1],
    },
    // The pattern by which people are connected.
    {
      ...placed(pattern, "P"),
      ...gathered(grid, "G", [C, C]),
      E0: [...essay0, 0, 0],
      E1: [...essay1, 0, 0],
      E2: [...essay2, 0, 0],
    },
    // The series: three cities, twenty to forty people each.
    {
      ...placed(crowds, "K", 2.6, 0.9),
      C0: [...city0, 8, 1],
      C1: [...city1, 5, 1],
      C2: [...city2, 5, 1],
      ...gathered(pattern, "P", [C, C]),
    },
    // How it is funded: two streams into the research.
    {
      I: [120, 190, 7, 1],
      W: [480, 190, 7, 1],
      R: [C, 330, 12, 1],
      ...gathered(crowds, "K", [C, 330]),
      C0: [C, 330, 0, 0],
      C1: [C, 330, 0, 0],
      C2: [C, 330, 0, 0],
    },
  ],
  links: [
    ...grid
      .flatMap((_, i): [string, string, string, number][] => [
        [`h${i}`, `G${i}`, `G${i + 1}`, 0],
        [`v${i}`, `G${i}`, `G${i + 4}`, 0],
      ])
      .filter(([id]) => lattice.includes(id)),
    ["e01", "E0", "E1", -30],
    ["e12", "E1", "E2", -30],
    ...pattern.flatMap((_, i): [string, string, string, number][] => [
      [`pa${i}`, `P${i}`, `P${(i + 1) % 9}`, 0],
      [`pb${i}`, `P${i}`, `P${(i + 3) % 9}`, 0],
    ]),
    ["c01", "C0", "C1", -20],
    ["c12", "C1", "C2", -20],
    ["fi", "I", "R", 40],
    ["fw", "W", "R", -40],
  ],
  visible: [
    lattice,
    ["e01", "e12"],
    pattern.flatMap((_, i) => [`pa${i}`, `pb${i}`]),
    ["c01", "c12"],
    ["fi", "fw"],
  ],
  flowing: [
    [],
    ["e01", "e12"],
    pattern.map((_, i) => `pa${i}`).filter((_, i) => i % 3 === 0),
    [],
    ["fi", "fw"],
  ],
  labels: [
    [],
    [
      [140, 402, "The future of work is play"],
      [C, 204, "Social contracts, not constitutions"],
      [460, 372, "Coordination is the unit of intelligence"],
    ],
    [],
    [
      [130, 398, "Amsterdam, spring 2026"],
      [C, 328, "Rotterdam, summer 2026"],
      [470, 398, "Berlin, autumn 2026"],
    ],
    [
      [120, 164, "individuals"],
      [480, 164, "the practice"],
      [C, 382, "the research"],
    ],
  ],
});
