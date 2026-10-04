/**
 * The homepage's drawing after the opening: a team around its shared memory,
 * AI arriving outside it, the organism of you, the practice and the network,
 * an economy of brains, and back to one lantern for the two ways in. The
 * opening itself draws the live network (see ./network), so stage 0 is empty.
 */
import { organism, type NodePlace, type Organism } from "./organism";

const C = 300;
type Triangle = [[number, number], [number, number], [number, number]];
const tri = (cx: number, cy: number, s: number): Triangle => [
  [cx, cy - s],
  [cx - s * 0.87, cy + s * 0.5],
  [cx + s * 0.87, cy + s * 0.5],
];
const at = (point: readonly [number, number], r: number, o = 1): NodePlace => [
  point[0],
  point[1],
  r,
  o,
];

const team = tri(C, 300, 135);
const shifted = tri(250, 330, 120);
const small = tri(300, 285, 58);
const net: [number, number][] = [
  [478, 248],
  [532, 292],
  [508, 356],
  [446, 344],
  [448, 284],
];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const economy: [number, number][] = Array.from({ length: 26 }, (_, i) => {
  const t = (i + 0.5) / 26;
  const radius = 128 + 160 * Math.sqrt(t);
  const a = i * GOLDEN + 0.6;
  const wobble = 1 + 0.08 * Math.sin(i * 2.3);
  return [
    C + Math.cos(a) * radius * wobble,
    C + Math.sin(a) * radius * 0.92 * wobble,
  ];
});
const shrink = ([x, y, r, o]: NodePlace, k = 0.4): NodePlace => [
  C + (x - C) * k,
  C + (y - C) * k,
  Math.max(r * 0.7, 3),
  o,
];

const one: Record<string, NodePlace> = {
  L: [110, 300, 10, 1],
  A: [150, 392, 7, 1],
  T1: at(small[0], 5),
  T2: at(small[1], 5),
  T3: at(small[2], 5),
  ...Object.fromEntries(net.map((p, i) => [`N${i + 1}`, at(p, 5)])),
};

// Each brain in the economy joins its two nearest neighbours.
const economyLinks = economy.flatMap((p, i) =>
  economy
    .map((q, j): [number, number] => [j, Math.hypot(p[0] - q[0], p[1] - q[1])])
    .filter(([j]) => j !== i)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([j]): [string, string, string, number] => {
      const [lo, hi] = i < j ? [i, j] : [j, i];
      return [`e${lo}-${hi}`, `E${lo + 1}`, `E${hi + 1}`, 8];
    }),
);
const uniqueEconomyLinks = economyLinks.filter(
  (link, index) =>
    economyLinks.findIndex((other) => other[0] === link[0]) === index,
);

export const livingOrganism: Organism = organism({
  id: "living-org",
  kinds: {
    L: "lantern",
    A: "hollow",
    ...Object.fromEntries(
      economy.map((_, i) => [`E${i + 1}`, i % 3 === 0 ? "lantern" : ""]),
    ),
  },
  stages: [
    // The opening draws the live network itself; the first team waits at the
    // centre point, where that network draws in, so the science opens out of
    // it (and closes back into it when the reading returns).
    {
      T1: [C, 300, 0, 0],
      T2: [C, 300, 0, 0],
      T3: [C, 300, 0, 0],
    },
    // The science: a team, its shared memory glowing at the centre.
    {
      L: [C, 300, 8, 1],
      T1: at(team[0], 6),
      T2: at(team[1], 6),
      T3: at(team[2], 6),
    },
    // The shift: the hybrid team, AI arriving outside the memory.
    {
      L: [250, 330, 7, 0.7],
      T1: at(shifted[0], 6, 0.45),
      T2: at(shifted[1], 6, 0.45),
      T3: at(shifted[2], 6, 0.45),
      A: [476, 150, 13, 1],
    },
    // One organism: you and your agent, the practice, the network.
    one,
    // Where this goes: the organism becomes one brain among many.
    {
      ...Object.fromEntries(
        Object.entries(one).map(([k, v]) => [k, shrink(v)]),
      ),
      ...Object.fromEntries(
        economy.map((p, i) => [`E${i + 1}`, at(p, i % 3 === 0 ? 6 : 4)]),
      ),
    },
    // Asked before: the economy stays, at rest; the live network beside the
    // chapter lights from the open question (see ./runtime).
    {
      ...Object.fromEntries(
        Object.entries(one).map(([k, v]) => [k, shrink(v)]),
      ),
      ...Object.fromEntries(
        economy.map((p, i) => [`E${i + 1}`, at(p, i % 3 === 0 ? 6 : 4)]),
      ),
    },
    // Two ways in: back to one lantern.
    { L: [C, C, 13, 1] },
  ],
  links: [
    ["t12", "T1", "T2", 0],
    ["t23", "T2", "T3", 0],
    ["t31", "T3", "T1", 0],
    ["s1", "L", "T1", 0],
    ["s2", "L", "T2", 0],
    ["s3", "L", "T3", 0],
    ["ai", "A", "L", 30],
    ["you-team", "L", "T2", 60],
    ["team-net", "T3", "N4", -50],
    ["n12", "N1", "N2", 0],
    ["n23", "N2", "N3", 0],
    ["n34", "N3", "N4", 0],
    ["n45", "N4", "N5", 0],
    ["n51", "N5", "N1", 0],
    ["n13", "N1", "N3", 0],
    ["core-e", "N2", "E3", 0],
    ["core-e2", "T1", "E1", 0],
    ["core-e3", "L", "E2", 0],
    ...uniqueEconomyLinks,
  ],
  visible: [
    [],
    ["t12", "t23", "t31", "s1", "s2", "s3"],
    ["t12", "t23", "t31", "s1", "s2", "s3", "ai"],
    [
      "t12",
      "t23",
      "t31",
      "ai",
      "you-team",
      "team-net",
      "n12",
      "n23",
      "n34",
      "n45",
      "n51",
      "n13",
    ],
    [
      "t12",
      "t23",
      "t31",
      "ai",
      "you-team",
      "team-net",
      "n12",
      "n23",
      "n34",
      "n45",
      "n51",
      "n13",
      "core-e",
      "core-e2",
      "core-e3",
      ...uniqueEconomyLinks.map((l) => l[0]),
    ],
    [],
  ],
  flowing: [
    [],
    ["t12", "t23", "t31"],
    [],
    ["ai", "you-team", "team-net", "n13"],
    [
      "you-team",
      "team-net",
      "core-e",
      "core-e2",
      "core-e3",
      ...uniqueEconomyLinks.filter((_, i) => i % 2 === 0).map((l) => l[0]),
    ],
    [],
  ],
  labels: [
    [],
    [
      [C, 138, "who knows what"],
      [183, 408, "whose judgment settles it"],
      [417, 408, "how knowledge moves"],
      [C, 334, "shared memory"],
    ],
    [
      [476, 116, "AI"],
      [476, 194, "no place in the team’s memory"],
    ],
    [
      [128, 346, "you"],
      [150, 430, "your agent"],
      [C, 350, "the practice"],
      [490, 404, "the network"],
    ],
    [[C, 590, "from one team to an economy"]],
    [],
  ],
});
