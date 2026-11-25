/**
 * The Foundation's drawing, one stage per chapter:
 * brains, each holding its own memory, joined without a center; the
 * Foundation's selection pointing to articles that stay beside their authors'
 * brains; the middle fading as the brains connect to each other; a
 * roundtable, a session where the work is shown live and a public program in
 * a hub; gifts and a sponsor flowing into the first year, the board apart
 * from the givers; and the Foundation holding the code, the method and the
 * name while the B.V. works under license and pays 25% back. The board and
 * the follow chapters keep the last stage.
 */
import {
  gathered,
  organism,
  placed,
  ring,
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

const M: Point[] = [
  [150, 175],
  [425, 140],
  [505, 335],
  [330, 455],
  [118, 392],
];
const Mout: Point[] = M.map(([x, y]) => [C + (x - C) * 1.1, C + (y - C) * 1.1]);
const sat = M.flatMap((m, i) => around(m, 3, 36, i * 0.9));
const S = ids(sat.length, "S");
const MI = ids(M.length, "M");
const memberSpokes: Thread[] = S.map((s, i) => [
  `ms${i}`,
  `M${Math.floor(i / 3)}`,
  s,
  0,
]);
const rhizome: Thread[] = [
  ["r01", "M0", "M1", -30],
  ["r12", "M1", "M2", -20],
  ["r23", "M2", "M3", -30],
  ["r34", "M3", "M4", -20],
  ["r40", "M4", "M0", -25],
  ["r13", "M1", "M3", 30],
];
// Writing: articles beside four authors, the Foundation's selection pointing to them.
const docAt: Point[] = Mout.slice(0, 4).map(([x, y], i) => [
  x + (i % 2 ? -34 : 34),
  y + 30,
]);
const D = ids(docAt.length, "D");
const authorship: Thread[] = D.map((d, i) => [`md${i}`, `M${i}`, d, 0]);
const pointers: Thread[] = D.map((d, i) => [`fp${i}`, "F", d, (i - 1.5) * 18]);
// Mission: the brains in a ring, every pair connected, nothing in the middle.
const Mring = around([C, C], 5, 178);
const mesh: Thread[] = MI.flatMap((a, i) =>
  MI.slice(i + 1).map((b, j): Thread => [`pm${i}${i + j + 1}`, a, b, 0]),
);
// Events.
const table: Point = [165, 235];
const seats = around(table, 8, 48);
const screen: Point = [450, 205];
const audience: Point[] = Array.from({ length: 6 }, (_, i) => [
  395 + i * 22,
  275 + Math.abs(i - 2.5) * 7,
]);
const hub: Point = [300, 430];
const crowd: Point[] = Array.from({ length: 12 }, (_, i) => {
  const a = scatter(i + 5) * Math.PI * 2;
  const r = 28 + scatter(i + 31) * 44;
  return [hub[0] + Math.cos(a) * r, hub[1] + Math.sin(a) * r * 0.8];
});
const SE = ids(8, "SE"),
  AU = ids(6, "AU"),
  CR = ids(12, "CR");
const tableRing = cycle(SE, "tr");
const watching: Thread[] = AU.map((a, i) => [`wa${i}`, a, "SV", 0]);
const program: Thread[] = CR.map((c, i) => [`hp${i}`, "HB", c, 0]);
// Support.
const F4: Point = [300, 370];
const gifts: Point[] = Array.from({ length: 7 }, (_, i) => [
  92 + i * 34,
  150 - Math.sin((i / 6) * Math.PI) * 40,
]);
const G = ids(gifts.length, "G");
const giving: Thread[] = G.map((g, i) => [`gv${i}`, g, "F", (3 - i) * 8]);
const board = around(F4, 5, 50);
const B = ids(board.length, "BD");
const boardRing = cycle(B, "bd");
// Why.
const F5: Point = [210, 300];
const held = around(F5, 3, 72, -Math.PI / 2);
const heldAt = (i: number): Point => held[i] ?? F5;
const H = ["CODE", "METHOD", "NAME"];
const holding: Thread[] = H.map((h, i) => [`fh${i}`, "F", h, 0]);
const BV: Point = [470, 300];

export const foundationOrganism: Organism = organism({
  id: "foundation-org",
  kinds: {
    ...Object.fromEntries(MI.map((m) => [m, "lantern"])),
    ...Object.fromEntries(D.map((d) => [d, "doc"])),
    ...Object.fromEntries(H.map((h) => [h, "doc"])),
    F: "lantern",
    SV: "doc",
    TB: "lantern",
    HB: "lantern",
    SP: "lit",
    BV: "lit",
    ...Object.fromEntries(B.map((b) => [b, "hollow"])),
  },
  stages: [
    { ...placed(M, "M", 8), ...placed(sat, "S", 3.5, 0.85) },
    {
      ...placed(Mout, "M", 6, 0.75),
      ...gathered(sat, "S", [C, C]),
      ...placed(docAt, "D"),
      F: [C, 300, 10, 1],
    },
    {
      ...placed(Mring, "M", 8),
      F: [C, C, 0, 0],
      ...gathered(docAt, "D", [C, C]),
    },
    {
      TB: at(table, 7),
      ...placed(seats, "SE", 4),
      SV: at(screen, 1),
      ...placed(audience, "AU", 4),
      HB: at(hub, 8),
      ...placed(crowd, "CR", 3, 0.9),
      ...gathered(Mring, "M", [C, C]),
    },
    {
      F: at(F4, 12),
      ...placed(gifts, "G", 4.5),
      SP: [500, 175, 8, 1],
      ...placed(board, "BD", 4.5, 0.8),
    },
    {
      F: at(F5, 13),
      CODE: at(heldAt(0), 1),
      METHOD: at(heldAt(1), 1),
      NAME: at(heldAt(2), 1),
      BV: at(BV, 9),
    },
  ],
  links: [
    ...memberSpokes,
    ...rhizome,
    ...authorship,
    ...pointers,
    ...mesh,
    ...tableRing,
    ...watching,
    ...program,
    ...giving,
    ["sp", "SP", "F", 30],
    ...boardRing,
    ...holding,
    ["lic", "F", "BV", -55],
    ["back", "BV", "F", -55],
  ],
  visible: [
    [...names(memberSpokes), ...names(rhizome)],
    [...names(authorship), ...names(pointers)],
    names(mesh),
    [...names(tableRing), ...names(watching), ...names(program)],
    [...names(giving), "sp", ...names(boardRing)],
    [...names(holding), "lic", "back"],
  ],
  flowing: [
    ["r01", "r23", "r40"],
    names(pointers),
    names(mesh).filter((_, i) => i % 3 === 0),
    names(watching).filter((_, i) => i % 2 === 0),
    [...names(giving).filter((_, i) => i % 2 === 0), "sp"],
    ["back"],
  ],
  labels: [
    [],
    [
      [C, 255, "the Foundation's selection"],
      [C, 566, "each article stays on its author's own Brain"],
    ],
    [[C, C + 5, "no one in the middle"]],
    [
      [165, 318, "roundtables and dinners"],
      [455, 330, "the work, shown live"],
      [300, 530, "a public program in a hub"],
    ],
    [
      [200, 82, "gifts, once or for five years"],
      [500, 140, "a sponsor, named"],
      [300, 456, "the first year, and no say"],
    ],
    [
      [210, 418, "the code, the method, the name"],
      [470, 345, "Rizom B.V., under license"],
      [340, 196, "25% back"],
    ],
  ] satisfies Label[][],
});
