// Organism specs for the three-site mockups, in the live format, rendered by sites/rizom-ai/src/story/organism.tsx.
// Run: bun docs/design/rizom-three-sites/organisms.ts  (writes organisms/<id>.json with the svg and stage css).
const ROOT = `${import.meta.dir}/../../..`;
const { organism, ring, scatter, placed, gathered } = await import(
  `${ROOT}/sites/rizom-ai/src/story/organism.tsx`
);
const { renderToStaticMarkup } = await import(
  `${ROOT}/node_modules/react-dom/server.js`
);
const OUT = `${import.meta.dir}/organisms`;

type P2 = [number, number];
type Place = [number, number, number, number];
type Thread = [string, string, string, number];
type Label = [number, number, string, ("start" | "middle" | "end")?];
const C = 300;
const at = (p: readonly number[], r: number, o = 1): Place => [
  p[0],
  p[1],
  r,
  o,
];
const ids = (n: number, prefix: string): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const names = (threads: Thread[]): string[] => threads.map((t) => t[0]);
const around = (c: P2, n: number, r: number, start = -Math.PI / 2): P2[] =>
  ring(n, r, start, c[0], c[1]);
const cycle = (nodes: string[], prefix: string): Thread[] =>
  nodes.map((id, i) => [`${prefix}${i}`, id, nodes[(i + 1) % nodes.length], 0]);
const spokes = (
  hub: string,
  nodes: string[],
  prefix: string,
  bend = 0,
): Thread[] => nodes.map((id, i) => [`${prefix}${i}`, hub, id, bend]);

const write = async (
  org: { svg(): unknown; css(): string; stageCount: number },
  id: string,
) => {
  await Bun.write(
    `${OUT}/${id}.json`,
    JSON.stringify({
      id,
      svg: renderToStaticMarkup(org.svg()),
      css: org.css(),
      stages: org.stageCount,
    }),
  );
  console.log(id, org.stageCount, "stages");
};

// ---------------------------------------------------------------- rizom.foundation
// Hero: brains, each holding its own memory, joined without a centre.
// Writing: the Foundation's selection points to articles that stay beside their authors' brains.
// Mission: the middle fades; the brains connect to each other.
// Events: a roundtable, a session where the work is shown live, a public program in a hub.
// Support: gifts and a sponsor flow into the first year; the board stays apart from the givers.
// Why: the Foundation holds the code, the method and the name; the B.V. works under license and pays 25% back.
{
  const M: P2[] = [
    [150, 175],
    [425, 140],
    [505, 335],
    [330, 455],
    [118, 392],
  ];
  const Mout: P2[] = M.map(([x, y]) => [C + (x - C) * 1.1, C + (y - C) * 1.1]);
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
  const docAt: P2[] = [0, 1, 2, 3].map((i) => [
    Mout[i][0] + (i % 2 ? -34 : 34),
    Mout[i][1] + 30,
  ]);
  const D = ids(docAt.length, "D");
  const authorship: Thread[] = D.map((d, i) => [`md${i}`, `M${i}`, d, 0]);
  const pointers: Thread[] = D.map((d, i) => [
    `fp${i}`,
    "F",
    d,
    (i - 1.5) * 18,
  ]);
  // Mission: the brains in a ring, every pair connected, nothing in the middle.
  const Mring = around([C, C], 5, 178);
  const mesh: Thread[] = MI.flatMap((a, i) =>
    MI.slice(i + 1).map((b, j): Thread => [`pm${i}${i + j + 1}`, a, b, 0]),
  );
  // Events.
  const table: P2 = [165, 235];
  const seats = around(table, 8, 48);
  const screen: P2 = [450, 205];
  const audience: P2[] = Array.from({ length: 6 }, (_, i) => [
    395 + i * 22,
    275 + Math.abs(i - 2.5) * 7,
  ]);
  const hub: P2 = [300, 430];
  const crowd: P2[] = Array.from({ length: 12 }, (_, i) => {
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
  const F4: P2 = [300, 370];
  const gifts: P2[] = Array.from({ length: 7 }, (_, i) => [
    92 + i * 34,
    150 - Math.sin((i / 6) * Math.PI) * 40,
  ]);
  const G = ids(gifts.length, "G");
  const giving: Thread[] = G.map((g, i) => [`gv${i}`, g, "F", (3 - i) * 8]);
  const board = around(F4, 5, 50);
  const B = ids(board.length, "BD");
  const boardRing = cycle(B, "bd");
  // Why.
  const F5: P2 = [210, 300];
  const held = around(F5, 3, 72, -Math.PI / 2);
  const H = ["CODE", "METHOD", "NAME"];
  const holding: Thread[] = H.map((h, i) => [`fh${i}`, "F", h, 0]);
  const BV: P2 = [470, 300];

  const org = organism({
    id: "fnd",
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
        CODE: at(held[0], 1),
        METHOD: at(held[1], 1),
        NAME: at(held[2], 1),
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
        [C, 255, "the Foundation&#x27;s selection"],
        [C, 566, "each article stays on its author&#x27;s own Brain"],
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
    ].map((set) =>
      set.map(
        ([x, y, t, a]) => [x, y, String(t).replace(/&#x27;/g, "'"), a] as Label,
      ),
    ),
  });
  await write(org, "fnd");
}

// ---------------------------------------------------------------- rizom.work
// Hero: everything runs through a few people. Science: a team around its shared map of who knows what.
// Problem: the shared memory is gone and an agent cannot reach what nobody wrote down.
// Hubs: the hub's Brain, fed by its members, a sponsor, members with Brains of their own.
// Teams: what was scattered gathers into the team's Brain. Public bodies: memory it owns, a small open model inside it.
// Partners: hubs, teams and public bodies, with advisers and certified partners working into them.
{
  const team = ring(10, 165, -Math.PI / 2).map(([x, y], i): P2 => [
    x + (scatter(i) - 0.5) * 40,
    y + (scatter(i + 11) - 0.5) * 40,
  ]);
  const W = ids(team.length, "W");
  const heroes: P2[] = [
    [245, 255],
    [365, 335],
  ];
  const byHero: Thread[] = W.map((w, i) => {
    const [x, y] = team[i];
    const h =
      Math.hypot(x - heroes[0][0], y - heroes[0][1]) <
      Math.hypot(x - heroes[1][0], y - heroes[1][1])
        ? "H0"
        : "H1";
    return [`hw${i}`, h, w, 0];
  });
  const teamRing = cycle(W, "tw");
  const toMemory: Thread[] = W.map((w, i) => [`wm${i}`, "L", w, 0]);
  const heroesAsTeam: P2[] = [
    [C - 60, C - 30],
    [C + 60, C + 30],
  ];
  // Hubs.
  const members = ring(10, 180, -Math.PI / 2);
  const own: P2[] = [1, 4, 6, 9].map((i) => [
    members[i][0] + (members[i][0] > C ? 30 : -30),
    members[i][1] + 26,
  ]);
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
  const scattered: P2[] = docs.map((_, i): P2 => [
    60 + scatter(i + 3) * 480,
    60 + scatter(i + 17) * 480,
  ]);
  const D = ids(docs.length, "D");
  const gathering: Thread[] = D.map((d, i) => [
    `dg${i}`,
    d,
    "L",
    (i - 3.5) * 4,
  ]);
  // Public bodies.
  const boundary = ring(14, 205, -Math.PI / 2);
  const BN = ids(boundary.length, "BN");
  const boundaryRing = cycle(BN, "bn");
  // Partners: three kinds of client, two kinds of partner.
  const kinds3: P2[] = [
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

  const org = organism({
    id: "wrk",
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
        H0: [...heroes[0], 11, 1] as Place,
        H1: [...heroes[1], 11, 1] as Place,
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
        K0: at(kinds3[0], 7),
        K1: at(kinds3[1], 7),
        K2: at(kinds3[2], 7),
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
  await write(org, "wrk");
}

// ---------------------------------------------------------------- rizom.ai
// Opening: today's map at rest (you, a team, the network). Then the Brain story, one brain among many, files ringing you.
{
  const tri = (cx: number, cy: number, s: number): P2[] => [
    [cx, cy - s],
    [cx - s * 0.87, cy + s * 0.5],
    [cx + s * 0.87, cy + s * 0.5],
  ];
  const small = tri(300, 285, 58);
  const net: P2[] = [
    [478, 248],
    [532, 292],
    [508, 356],
    [446, 344],
    [448, 284],
  ];
  const docsIn = Array.from({ length: 8 }, (_, i): P2 => [
    88 + (i % 2) * 64,
    118 + i * 50,
  ]);
  const docsRound = ring(8, 172, -Math.PI / 2);
  const chans: P2[] = [
    [C, 96],
    [514, C],
    [C, 504],
    [86, C],
  ];
  const bteam = ring(3, 78, -Math.PI / 2);
  const peers = ring(7, 200, -Math.PI / 3).map(([x, y], i): P2 => [
    x + (scatter(i) - 0.5) * 44,
    y + (scatter(i + 9) - 0.5) * 44,
  ]);
  const beyond = peers.map(([x, y]): P2 => [
    x * 1.12 - C * 0.12,
    y * 1.12 - C * 0.12,
  ]);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const economy: P2[] = Array.from({ length: 26 }, (_, i) => {
    const t = (i + 0.5) / 26;
    const radius = 128 + 160 * Math.sqrt(t);
    const a = i * GOLDEN + 0.6;
    const wobble = 1 + 0.08 * Math.sin(i * 2.3);
    return [
      C + Math.cos(a) * radius * wobble,
      C + Math.sin(a) * radius * 0.92 * wobble,
    ];
  });
  const econLinks = economy.flatMap((p, i) =>
    economy
      .map((q, j): [number, number] => [
        j,
        Math.hypot(p[0] - q[0], p[1] - q[1]),
      ])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([j]): Thread => {
        const [lo, hi] = i < j ? [i, j] : [j, i];
        return [`e${lo}-${hi}`, `E${lo}`, `E${hi}`, 8];
      }),
  );
  const econ = econLinks.filter(
    (l, k) => econLinks.findIndex((o) => o[0] === l[0]) === k,
  );
  const D = ids(8, "D"),
    K = ids(4, "K"),
    T = ids(3, "T"),
    P = ids(7, "P");
  const gather: Thread[] = D.map((d, i) => [`d${i}`, d, "L", (i - 3.5) * 6]);
  const channels = spokes("L", K, "k");
  const teamSpokes = spokes("L", T, "t");
  const teamRing = cycle(T, "tt");
  const peerSpokes = spokes("L", P, "p");
  const peerRing = cycle(P, "q");
  const keep = spokes("L", D, "r");
  const opening: Thread[] = [
    ["y12", "Y0", "Y1", 0],
    ["y23", "Y1", "Y2", 0],
    ["y31", "Y2", "Y0", 0],
    ["you-team", "L", "Y1", 60],
    ["team-net", "Y2", "N3", -50],
    ["n12", "N0", "N1", 0],
    ["n23", "N1", "N2", 0],
    ["n34", "N2", "N3", 0],
    ["n45", "N3", "N4", 0],
    ["n51", "N4", "N0", 0],
    ["n13", "N0", "N2", 0],
  ];
  const org = organism({
    id: "aio",
    kinds: {
      L: "lantern",
      ...Object.fromEntries(D.map((d) => [d, "doc"])),
      ...Object.fromEntries(
        economy.map((_, i) => [`E${i}`, i % 3 === 0 ? "lantern" : ""]),
      ),
    },
    stages: [
      {
        L: [110, 300, 10, 1],
        ...placed(small, "Y", 5),
        ...placed(net, "N", 5),
      },
      { L: [C + 110, C, 12, 1], ...placed(docsIn, "D") },
      {
        L: [C, C, 13, 1],
        ...placed(chans, "K", 7),
        ...gathered(docsIn, "D", [C, C]),
      },
      {
        L: [C, C, 12, 1],
        ...placed(bteam, "T"),
        ...placed(peers, "P", 3.5, 0.3),
        ...gathered(chans, "K", [C, C]),
      },
      {
        L: [C, C, 12, 1],
        ...placed(peers, "P"),
        ...gathered(bteam, "T", [C, C]),
      },
      {
        L: [C, C, 8, 1],
        ...Object.fromEntries(
          economy.map((p, i) => [`E${i}`, at(p, i % 3 === 0 ? 6 : 4)]),
        ),
      },
      {
        L: [C, C, 13, 1],
        ...placed(docsRound, "D"),
        ...placed(beyond, "P", 4, 0.25),
      },
    ],
    links: [
      ...opening,
      ...gather,
      ...channels,
      ...teamSpokes,
      ...teamRing,
      ...peerSpokes,
      ...peerRing,
      ...econ,
      ...keep,
    ],
    visible: [
      names(opening),
      names(gather),
      names(channels),
      [...names(teamSpokes), ...names(teamRing)],
      [...names(peerSpokes), ...names(peerRing)],
      names(econ),
      names(keep),
    ],
    flowing: [
      [],
      names(gather),
      names(channels),
      names(teamSpokes),
      names(peerSpokes).filter((_, i) => i % 2 === 0),
      names(econ).filter((_, i) => i % 5 === 0),
      [],
    ],
    labels: [
      [],
      [
        [C + 110, C + 46, "your brain"],
        [120, 560, "notes, essays, decisions"],
      ],
      [
        [C, 74, "your site"],
        [548, C + 5, "Discord", "start"],
        [C, 536, "Claude, over MCP"],
        [52, C + 5, "the terminal", "end"],
      ],
      [
        [C, C + 34, "you"],
        [C, 380, "your team"],
        [C, 540, "the network"],
      ],
      [[C, 552, "a light on the map"]],
      [[C, 572, "one brain among many"]],
      [[C, 528, "markdown, in git, on your server"]],
    ],
  });
  await write(org, "aio");
}
