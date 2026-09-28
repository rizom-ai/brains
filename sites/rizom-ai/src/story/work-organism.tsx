/**
 * The Work page's drawing: a team with AI outside it, the same work done three
 * times, the audit (a survey, a half-day in the room, the map), the teams this
 * sounds like, the mapped team with AI in its place, and the three types of
 * team.
 */
import {
  gathered,
  organism,
  placed,
  ring,
  scatter,
  type NodePlace,
  type Organism,
  type Thread,
} from "./organism";

const C = 300;
const tri = (cx: number, cy: number, s: number): [number, number][] => [
  [cx, cy - s],
  [cx - s * 0.87, cy + s * 0.5],
  [cx + s * 0.87, cy + s * 0.5],
];
const team = tri(C, 312, 128);
const audited = tri(450, 300, 52);
const room = ring(6, 44, 0, 190, 300);
const survey = Array.from({ length: 12 }, (_, i): [number, number] => [
  110 + scatter(i) * 70,
  200 + scatter(i + 30) * 200,
]);
const many = Array.from({ length: 12 }, (_, i): [number, number] => [
  140 + (i % 4) * 106 + (scatter(i) - 0.5) * 50,
  170 + Math.floor(i / 4) * 130 + (scatter(i + 5) - 0.5) * 40,
]);
const small = tri(150, C, 52);
const square = ring(4, 52, -Math.PI / 4, C, C);
const pentagon = ring(5, 52, -Math.PI / 2, 450, C);

const ids = (points: readonly unknown[], prefix: string): string[] =>
  points.map((_, i) => `${prefix}${i}`);
const T = ids(team, "T");
const R = ids(room, "R");
const P = ids(many, "P");
const Q = ids(square, "Q");
const F = ids(pentagon, "F");
const cycle = (nodes: readonly string[], prefix: string, bend = 0): Thread[] =>
  nodes.map((id, i) => [
    `${prefix}${i}`,
    id,
    nodes[(i + 1) % nodes.length] ?? id,
    bend,
  ]);
const names = (threads: readonly Thread[]): string[] =>
  threads.map((thread) => thread[0]);

const teamOuter = cycle(T, "t", 38);
const teamInner = cycle(T, "u", -24);
const confusion: Thread[] = T.map((id, i) => [`x${i}`, id, "X", 0]);
const roomRing = cycle(R, "rm", 12);
const mapped: Thread[] = T.map((id, i) => [`m${i}`, id, "M", 0]);
const grown: Thread[] = P.flatMap((id, i) =>
  i % 3 === 0 ? [[`p${i}`, id, P[(i + 5) % P.length] ?? id, 20]] : [],
);
const squareRing = cycle(Q, "q");
const pentagonRing = cycle(F, "f");
const hidden = (
  points: readonly unknown[],
  prefix: string,
): Record<string, NodePlace> =>
  placed(
    points.map((): [number, number] => [C, C]),
    prefix,
    0,
    0,
  );

export const workOrganism: Organism = organism({
  id: "work-org",
  kinds: { AI: "hollow", M: "lantern" },
  stages: [
    // A team, and AI outside it.
    { ...placed(team, "T", 6), AI: [478, 132, 12, 1] },
    // The problem: the same work three times; nobody has the map.
    { ...placed(team, "T", 6), X: [C, 250, 9, 1], AI: [478, 132, 12, 0.5] },
    // The audit: the survey, the half-day in the room, the map.
    {
      ...placed(survey, "S", 3.5, 0.9),
      ...placed(room, "R", 4.5),
      ...placed(audited, "T"),
      M: [450, 300, 7, 1],
      AI: [478, 132, 12, 0],
      X: [C, 250, 4, 0],
    },
    // If this sounds like you: many people, grown fast.
    {
      ...placed(many, "P", 4.5),
      ...gathered(survey, "S", [C, C]),
      ...gathered(room, "R", [C, C]),
      ...hidden(team, "T"),
      M: [C, 300, 0, 0],
    },
    // What teams tell us: the mapped team, AI inside it.
    {
      ...placed(team, "T", 6),
      M: [C, 312, 9, 1],
      AI: [452, 194, 8, 1],
      ...gathered(many, "P", [C, C]),
    },
    // Who we are: three types of team.
    {
      ...placed(small, "T"),
      ...placed(square, "Q"),
      ...placed(pentagon, "F"),
      M: [C, C, 7, 1],
      AI: [452, 194, 8, 0],
    },
  ],
  links: [
    ...teamOuter,
    ...teamInner,
    ["ai", "AI", "T2", 30],
    ...confusion,
    ["s", "S0", "R0", 0],
    ["r", "R3", "M", 0],
    ...roomRing,
    ...mapped,
    ["aiin", "AI", "T2", -20],
    ...grown,
    ...squareRing,
    ...pentagonRing,
  ],
  visible: [
    [...names(teamOuter), ...names(teamInner), "ai"],
    [...names(teamOuter), ...names(teamInner), ...names(confusion)],
    ["s", "r", ...names(roomRing), ...names(teamOuter)],
    names(grown),
    [...names(teamOuter), ...names(mapped), "aiin"],
    [...names(teamOuter), ...names(squareRing), ...names(pentagonRing)],
  ],
  flowing: [[], [], ["s", "r"], [], [...names(teamOuter), "aiin"], []],
  labels: [
    [[478, 100, "AI"]],
    [
      [C, 228, "the same work, three times"],
      [C, 520, "nobody has mapped who knows what"],
    ],
    [
      [145, 430, "a short survey"],
      [190, 372, "a half-day in the room"],
      [450, 372, "the map"],
    ],
    [[C, 552, "grown faster than the operating model"]],
    [
      [452, 168, "AI, with a place"],
      [C, 512, "a map the whole team can act on"],
    ],
    [[C, 400, "three types of team, which is yours?"]],
  ],
});
