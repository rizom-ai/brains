/**
 * Rizom Work's drawing, one stage per chapter:
 * everything running through a few people; a team around its shared map of
 * who knows what; the shared memory gone and an agent unable to reach what
 * nobody wrote down; the hub's Brain, fed by its members, with a sponsor and
 * members with Brains of their own; what was scattered gathering into the
 * team's Brain; a public body with memory it owns and a small open model
 * inside it; and hubs, teams and public bodies with advisers and certified
 * partners working into them. The closing chapter keeps the last stage.
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
} from "@rizom/site-rizom-ai";

type Point = [number, number];

const C = 300;
const at = (p: Point, r: number, o = 1): NodePlace => [p[0], p[1], r, o];
const ids = (n: number, prefix: string): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const names = (threads: Thread[]): string[] => threads.map((t) => t[0]);
const around = (
  c: Point,
  n: number,
  r: number,
  start = -Math.PI / 2,
): Point[] => ring(n, r, start, c[0], c[1]);
const cycle = (nodes: string[], prefix: string): Thread[] =>
  nodes.map((id, i) => [
    `${prefix}${i}`,
    id,
    nodes[(i + 1) % nodes.length] ?? id,
    0,
  ]);

const team = ring(10, 165, -Math.PI / 2).map(([x, y], i): Point => [
  x + (scatter(i) - 0.5) * 40,
  y + (scatter(i + 11) - 0.5) * 40,
]);
const W = ids(team.length, "W");
const hero0: Point = [245, 255];
const hero1: Point = [365, 335];
const byHero: Thread[] = team.map(([x, y], i) => [
  `hw${i}`,
  Math.hypot(x - hero0[0], y - hero0[1]) <
  Math.hypot(x - hero1[0], y - hero1[1])
    ? "H0"
    : "H1",
  `W${i}`,
  0,
]);
const teamRing = cycle(W, "tw");
const toMemory: Thread[] = W.map((w, i) => [`wm${i}`, "L", w, 0]);
// Hubs.
const members = ring(10, 180, -Math.PI / 2);
const own: Point[] = members
  .filter((_, i) => [1, 4, 6, 9].includes(i))
  .map(([x, y]) => [x + (x > C ? 30 : -30), y + 26]);
const O = ids(own.length, "O");
const feeding: Thread[] = W.map((w, i) => [`fe${i}`, w, "L", 0]);
const owning: Thread[] = O.map((o, i) => [
  `ow${i}`,
  `W${[1, 4, 6, 9][i]}`,
  o,
  0,
]);
// Teams.
const docs = ring(8, 125, -Math.PI / 2);
const scattered: Point[] = docs.map((_, i): Point => [
  60 + scatter(i + 3) * 480,
  60 + scatter(i + 17) * 480,
]);
const D = ids(docs.length, "D");
const gathering: Thread[] = D.map((d, i) => [`dg${i}`, d, "L", (i - 3.5) * 4]);
// Public bodies.
const boundary = ring(14, 205, -Math.PI / 2);
const BN = ids(boundary.length, "BN");
const boundaryRing = cycle(BN, "bn");
// Partners: three kinds of client, two kinds of partner.
const kinds3: Point[] = [
  [150, 215],
  [450, 215],
  [300, 420],
];
const kindSat = kinds3.flatMap((k, i) => around(k, 4, 34, i));
const KS = ids(kindSat.length, "KS");
const kindSpokes: Thread[] = KS.map((s, i) => [
  `ks${i}`,
  `K${Math.floor(i / 4)}`,
  s,
  0,
]);
const partnerLinks: Thread[] = [
  ["pa0", "PA", "K0", 20],
  ["pa1", "PA", "K2", -20],
  ["pc0", "PC", "K1", -20],
  ["pc1", "PC", "K2", 20],
];

export const workOrganism: Organism = organism({
  id: "work-org",
  kinds: {
    L: "lantern",
    A: "hollow",
    MD: "lit",
    SPO: "lit",
    H0: "lit",
    H1: "lit",
    PA: "lit",
    PC: "lit",
    K0: "lantern",
    K1: "lantern",
    K2: "lantern",
    ...Object.fromEntries(O.map((o) => [o, "lantern"])),
    ...Object.fromEntries(D.map((d) => [d, "doc"])),
    ...Object.fromEntries(BN.map((b) => [b, "hollow"])),
  },
  stages: [
    {
      ...placed(team, "W", 4),
      H0: at(hero0, 11),
      H1: at(hero1, 11),
    },
    {
      ...placed(team, "W", 5),
      H0: [C, C, 0, 0],
      H1: [C, C, 0, 0],
      L: [C, C, 9, 1],
    },
    {
      ...placed(team, "W", 5, 0.8),
      L: [C, C, 4, 0.2],
      A: [505, 120, 13, 1],
      ...placed(scattered, "D", 1, 0.35),
    },
    {
      ...placed(members, "W", 4.5),
      ...placed(own, "O", 5),
      L: [C, C, 11, 1],
      SPO: [C, 58, 8, 1],
    },
    { ...placed(docs, "D"), L: [C, C, 12, 1], ...placed(team, "W", 3, 0.25) },
    {
      ...placed(boundary, "BN", 4, 0.7),
      L: [255, 300, 11, 1],
      MD: [365, 300, 7, 1],
      ...gathered(docs, "D", [255, 300]),
    },
    {
      ...placed(kinds3, "K", 7),
      ...placed(kindSat, "KS", 3.5),
      PA: [70, 470, 7, 1],
      PC: [530, 470, 7, 1],
    },
  ],
  links: [
    ...byHero,
    ["hh", "H0", "H1", 20],
    ...teamRing,
    ...toMemory,
    ...feeding,
    ...owning,
    ["spo", "SPO", "L", 0],
    ...gathering,
    ...boundaryRing,
    ["model", "L", "MD", 0],
    ...kindSpokes,
    ...partnerLinks,
  ],
  visible: [
    [...names(byHero), "hh"],
    [...names(teamRing), ...names(toMemory)],
    names(teamRing),
    [...names(feeding), ...names(owning), "spo"],
    names(gathering),
    [...names(boundaryRing), "model"],
    [...names(kindSpokes), ...names(partnerLinks)],
  ],
  flowing: [
    names(byHero).filter((_, i) => i % 2 === 0),
    names(toMemory).filter((_, i) => i % 3 === 0),
    [],
    [...names(feeding).filter((_, i) => i % 2 === 0), "spo"],
    names(gathering),
    ["model"],
    names(partnerLinks),
  ],
  labels: [
    [[C, 450, "everything runs through a few people"]],
    [
      [C, 96, "who knows what"],
      [528, 470, "whose judgment settles it", "end"],
      [72, 470, "how knowledge moves", "start"],
    ],
    [
      [505, 82, "an agent"],
      [C, C + 40, "what nobody wrote down"],
    ],
    [
      [C, C + 46, "the hub's Brain"],
      [C, 30, "a sponsor"],
      [C, 540, "members with a Brain of their own"],
    ],
    [
      [C, C + 48, "the team's Brain"],
      [C, 512, "a setup at a fixed price"],
      [C, 540, "then a monthly fee, or run it yourself"],
    ],
    [
      [255, 348, "memory it owns"],
      [365, 270, "a small open model"],
    ],
    [
      [150, 284, "hubs"],
      [450, 284, "teams"],
      [300, 492, "public bodies"],
      [70, 505, "advisers"],
      [530, 505, "certified partners"],
    ],
  ],
});
