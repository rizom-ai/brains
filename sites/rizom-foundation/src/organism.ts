/**
 * The Foundation's drawing: one population of lights, the members' Brains,
 * each holding its own memory, rearranged chapter by chapter. The Foundation
 * is never a light among them and never in the middle; it is the ground they
 * stand on.
 *
 * 0. The case: Brains joined to their neighbors, with no center.
 * 1. Members' writing: four authors keep an article beside them; the
 *    Foundation's selection is a thread through the articles, not a hub.
 * 2. The mission: the lights move out of the middle and connect around it.
 * 3. Events: the same lights meet at a roundtable, around the work shown
 *    live, and at a public program.
 * 4. Founding supporters: the commons appears as a root under the network,
 *    and gifts run into it.
 * 5. Why a foundation: the code, the method and the name are held in the
 *    root, and every Brain stands on it. The board and the follow chapters
 *    keep this stage.
 */
import {
  gathered,
  organism,
  placed,
  scatter,
  type Label,
  type NodePlace,
  type Organism,
  type Thread,
} from "@rizom/site-rizom-ai";

type Point = [number, number];

const C = 300;
const at = (p: Point, r: number, o = 1): NodePlace => [p[0], p[1], r, o];
const ids = (n: number, prefix: string): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const names = (threads: Thread[]): string[] => threads.map((t) => t[0]);
const pointAt = (points: Point[], i: number): Point => points[i] ?? [C, C];
const threads = (
  prefix: string,
  pairs: readonly (readonly [string, string, number?])[],
): Thread[] =>
  pairs.map(([from, to, bend], i) => [`${prefix}${i}`, from, to, bend ?? 0]);

/* ---- the lights, as the case opens: scattered, joined to neighbors ---- */

const scattered: Point[] = [
  [105, 150],
  [235, 100],
  [370, 135],
  [495, 95],
  [520, 230],
  [400, 255],
  [270, 225],
  [150, 290],
  [90, 420],
  [225, 405],
  [350, 370],
  [480, 385],
  [400, 500],
  [215, 520],
];
const L = ids(scattered.length, "L");

// Each Brain's own memory: two small lights beside it.
const memory: Point[] = scattered.flatMap(([x, y], i) =>
  [0, 1].map((k): Point => {
    const a = scatter(i * 2 + k + 3) * Math.PI * 2;
    return [x + Math.cos(a) * 22, y + Math.sin(a) * 22];
  }),
);
const holding = threads(
  "lm",
  memory.map((_, i) => [`L${Math.floor(i / 2)}`, `S${i}`] as const),
);
const neighbors = threads("nb", [
  ["L0", "L1", -12],
  ["L1", "L6", 10],
  ["L6", "L2", -10],
  ["L2", "L3", 12],
  ["L3", "L4", -10],
  ["L4", "L5", 10],
  ["L5", "L10", -12],
  ["L6", "L7", 10],
  ["L7", "L0", -12],
  ["L7", "L9", 12],
  ["L9", "L8", -10],
  ["L9", "L10", 10],
  ["L10", "L11", -10],
  ["L11", "L4", 12],
  ["L11", "L12", 10],
  ["L12", "L13", -12],
  ["L13", "L9", 10],
]);

/* ---- members' writing: articles beside their authors ---- */

const authors = [1, 4, 9, 12];
const articleAt: Point[] = authors.map((a) => {
  const [x, y] = pointAt(scattered, a);
  return [x + (x > C ? -34 : 34), y + 30];
});
const D = ids(articleAt.length, "D");
const authorship = threads(
  "au",
  authors.map((a, i) => [`L${a}`, `D${i}`] as const),
);
// The selection threads through the articles, in order around the page.
const selection = threads("se", [
  ["D0", "D1", -40],
  ["D1", "D3", -40],
  ["D3", "D2", -40],
  ["D2", "D0", -40],
]);

/* ---- the mission: out of the middle, joined around it ---- */

const angleOrder = scattered
  .map(([x, y], i) => ({ i, a: Math.atan2(y - C, x - C) }))
  .sort((p, q) => p.a - q.a)
  .map(({ i }) => i);
const decentered: Point[] = scattered.map((_, i) => {
  const k = angleOrder.indexOf(i);
  const a =
    -Math.PI +
    ((k + 0.5) / scattered.length) * Math.PI * 2 +
    (scatter(i + 30) - 0.5) * 0.18;
  const r = 185 + scatter(i + 40) * 55;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r];
});
// Each light to the next around the middle, and a few to a near neighbor.
const byAngle = angleOrder.map((i) => `L${i}`);
const around = threads(
  "ar",
  byAngle.map((id, k) => [id, byAngle[(k + 1) % byAngle.length] ?? id, -8]),
);

/* ---- events: the same lights meet ---- */

const table: Point = [175, 190];
const tableSeats = [0, 1, 6, 7, 2];
const screen: Point = [455, 205];
const watchers = [3, 4, 5, 11];
const program: Point = [300, 440];
const programPeople = [8, 9, 10, 12, 13];
const seat = (c: Point, k: number, n: number, r: number): Point => {
  const a = -Math.PI / 2 + ((k + scatter(k + n * 7) * 0.6) / n) * Math.PI * 2;
  const d = r * (0.7 + scatter(k + n * 11) * 0.5);
  return [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
};
const met: Record<string, NodePlace> = Object.fromEntries([
  ...tableSeats.map((l, k) => [`L${l}`, at(seat(table, k, 5, 52), 6)]),
  ...watchers.map((l, k) => [
    `L${l}`,
    at([screen[0] - 66 + k * 44, screen[1] + 70 + Math.abs(k - 1.5) * 10], 6),
  ]),
  ...programPeople.map((l, k) => [`L${l}`, at(seat(program, k, 5, 62), 6)]),
]);
// Each gathering joined around itself, in the order its people sit.
const gathering = (prefix: string, people: number[], c: Point): Thread[] => {
  const seated = people
    .map((l) => {
      const [x, y] = met[`L${l}`] ?? [c[0], c[1]];
      return { l, a: Math.atan2(y - c[1], x - c[0]) };
    })
    .sort((p, q) => p.a - q.a)
    .map(({ l }) => `L${l}`);
  return threads(
    prefix,
    seated.map((id, k) => [id, seated[(k + 1) % seated.length] ?? id, 10]),
  );
};
const atTable = gathering("tb", tableSeats, table);
const watching = threads(
  "wa",
  watchers.map((l) => [`L${l}`, "SV"] as const),
);
const together = gathering("pg", programPeople, program);

/* ---- the root: the commons under the network ---- */

const rootAt: Point[] = Array.from({ length: 9 }, (_, i) => [
  60 + i * 60,
  535 + Math.sin(i * 1.3) * 10,
]);
const R = ids(rootAt.length, "R");
const root = threads(
  "rt",
  R.slice(0, -1).map((r, i) => [r, R[i + 1] ?? r, i % 2 ? 8 : -8] as const),
);
// The network above it, lifted to leave the root its room.
const lifted: Point[] = scattered.map(([x, y]) => [x, 60 + (y - 60) * 0.78]);
const nearestRoot = (x: number): string =>
  `R${Math.min(R.length - 1, Math.max(0, Math.round((x - 60) / 60)))}`;

// Gifts: small lights coming in from both sides, each running into the root.
const giftAt: Point[] = Array.from({ length: 9 }, (_, i) => [
  75 + i * 56 + (scatter(i + 60) - 0.5) * 24,
  468 + scatter(i + 70) * 30,
]);
const G = ids(giftAt.length, "G");
const giving = threads(
  "gv",
  giftAt.map(
    ([x], i) => [`G${i}`, nearestRoot(x), (scatter(i) - 0.5) * 20] as const,
  ),
);

/* ---- why a foundation: held in the root, every Brain standing on it ---- */

const heldAt: Point[] = [
  [200, 535],
  [300, 545],
  [400, 535],
];
const H = ["CODE", "METHOD", "NAME"];
const lowest = [8, 13, 12, 11];
const standing = threads(
  "st",
  lowest.map((l) => [`L${l}`, nearestRoot(pointAt(lifted, l)[0]), 10] as const),
);

const rootPlaced = placed(rootAt, "R", 2.2, 0.8);

export const foundationOrganism: Organism = organism({
  id: "commons-org",
  kinds: {
    ...Object.fromEntries(L.map((l) => [l, "lantern"])),
    ...Object.fromEntries(D.map((d) => [d, "doc"])),
    ...Object.fromEntries(H.map((h) => [h, "doc"])),
    ...Object.fromEntries(G.map((g) => [g, "lit"])),
    SV: "doc",
  },
  stages: [
    // 0. The case.
    { ...placed(scattered, "L", 8), ...placed(memory, "S", 2.6, 0.85) },
    // 1. Members' writing.
    {
      ...placed(scattered, "L", 6, 0.55),
      ...Object.fromEntries(
        authors.map((a) => [`L${a}`, at(pointAt(scattered, a), 8)]),
      ),
      ...gathered(memory, "S", [C, C]),
      ...placed(articleAt, "D"),
    },
    // 2. The mission.
    { ...placed(decentered, "L", 8), ...gathered(articleAt, "D", [C, C]) },
    // 3. Events.
    { ...met, SV: at(screen, 1) },
    // 4. Founding supporters.
    {
      ...placed(lifted, "L", 7, 0.8),
      ...rootPlaced,
      ...placed(giftAt, "G", 3.4),
    },
    // 5. Why a foundation.
    {
      ...placed(lifted, "L", 7),
      ...rootPlaced,
      CODE: at(pointAt(heldAt, 0), 1),
      METHOD: at(pointAt(heldAt, 1), 1),
      NAME: at(pointAt(heldAt, 2), 1),
      ...gathered(giftAt, "G", [C, 540]),
    },
  ],
  links: [
    ...holding,
    ...neighbors,
    ...authorship,
    ...selection,
    ...around,
    ...atTable,
    ...watching,
    ...together,
    ...root,
    ...giving,
    ...standing,
  ],
  visible: [
    [...names(holding), ...names(neighbors)],
    [...names(authorship), ...names(selection)],
    names(around),
    [...names(atTable), ...names(watching), ...names(together)],
    [...names(neighbors), ...names(root), ...names(giving)],
    [...names(neighbors), ...names(root), ...names(standing)],
  ],
  flowing: [
    ["nb2", "nb9", "nb14"],
    names(selection),
    names(around).filter((_, i) => i % 3 === 0),
    names(watching),
    names(giving).filter((_, i) => i % 2 === 0),
    names(standing).filter((_, i) => i % 3 === 0),
  ],
  labels: [
    [],
    [
      [C, C + 4, "the Foundation's selection"],
      [C, 586, "each article stays beside its author"],
    ],
    [[C, C + 4, "no one in the middle"]],
    [
      [table[0], table[1] + 82, "a roundtable"],
      [screen[0], screen[1] - 22, "the work, shown live"],
      [program[0], program[1] + 92, "a public program"],
    ],
    [[C, 584, "the first year, started by founding supporters"]],
    [[C, 584, "the code, the method, the name, held in common"]],
  ] satisfies Label[][],
});
