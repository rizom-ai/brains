/**
 * The Brain page's drawing: your brain, growing from one lantern to a seat in
 * the network. The files on your disk gather into it, the places you talk to
 * it reach out, it is yours, then your team's, then the network's, the peers
 * light around it, and the files are still yours, in a ring, at the end.
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
/** Capture: a column of files on the left. */
const docsIn = Array.from({ length: 8 }, (_, i): [number, number] => [
  88 + (i % 2) * 64,
  118 + i * 50,
]);
/** Your data: the files around you. */
const docsRound = ring(8, 172, -Math.PI / 2);
/** Ask: the places you talk to it. */
const chans: [number, number][] = [
  [C, 96],
  [514, C],
  [C, 504],
  [86, C],
];
/** You, team, network: the team close around you. */
const team = ring(3, 78, -Math.PI / 2);
/** Connect: the peers, and where they drift once the files ring you. */
const peers = ring(7, 200, -Math.PI / 3).map(([x, y], i): [number, number] => [
  x + (scatter(i) - 0.5) * 44,
  y + (scatter(i + 9) - 0.5) * 44,
]);
const beyond = peers.map(([x, y]): [number, number] => [
  x * 1.12 - C * 0.12,
  y * 1.12 - C * 0.12,
]);

const lantern = (x: number, y: number, r: number): NodePlace => [x, y, r, 1];
const ids = (points: readonly unknown[], prefix: string): string[] =>
  points.map((_, i) => `${prefix}${i}`);
const D = ids(docsIn, "D");
const K = ids(chans, "K");
const T = ids(team, "T");
const P = ids(peers, "P");
/** Threads from the lantern to each node. */
const spokes = (nodes: readonly string[], prefix: string): Thread[] =>
  nodes.map((id, i) => [`${prefix}${i}`, "L", id, 0]);
/** Threads around a ring of nodes. */
const cycle = (nodes: readonly string[], prefix: string): Thread[] =>
  nodes.map((id, i) => [
    `${prefix}${i}`,
    id,
    nodes[(i + 1) % nodes.length] ?? id,
    0,
  ]);
const names = (threads: readonly Thread[]): string[] =>
  threads.map((thread) => thread[0]);

const gather: Thread[] = D.map((id, i) => [`d${i}`, id, "L", (i - 3.5) * 6]);
const channels = spokes(K, "k");
const teamSpokes = spokes(T, "t");
const teamRing = cycle(T, "tt");
const peerSpokes = spokes(P, "p");
const peerRing = cycle(P, "q");
const keep = spokes(D, "r");

export const brainOrganism: Organism = organism({
  id: "brain-org",
  kinds: { L: "lantern", ...Object.fromEntries(D.map((id) => [id, "doc"])) },
  stages: [
    // You: one lantern, faint hints of what is on your disk around it.
    { L: lantern(C, C, 14), ...placed(docsRound, "D", 5, 0.16) },
    // Answers: the files gather from the left into your brain.
    { L: lantern(C + 110, C, 12), ...placed(docsIn, "D") },
    // Capabilities: your brain at the centre, four channels reaching out.
    {
      L: lantern(C, C, 13),
      ...placed(chans, "K", 7),
      ...gathered(docsIn, "D", [C, C]),
    },
    // You, team, network: your team close around you, the network faint beyond.
    {
      L: lantern(C, C, 12),
      ...placed(team, "T"),
      ...placed(peers, "P", 3.5, 0.3),
      ...gathered(chans, "K", [C, C]),
    },
    // The collective: the peers light around you.
    {
      L: lantern(C, C, 12),
      ...placed(peers, "P"),
      ...gathered(team, "T", [C, C]),
    },
    // Stays yours: the files ring you; the peers stay, faint, further out.
    {
      L: lantern(C, C, 13),
      ...placed(docsRound, "D"),
      ...placed(beyond, "P", 4, 0.25),
    },
  ],
  links: [
    ...gather,
    ...channels,
    ...teamSpokes,
    ...teamRing,
    ...peerSpokes,
    ...peerRing,
    ...keep,
  ],
  visible: [
    [],
    names(gather),
    names(channels),
    [...names(teamSpokes), ...names(teamRing)],
    [...names(peerSpokes), ...names(peerRing)],
    names(keep),
  ],
  flowing: [
    [],
    names(gather),
    names(channels),
    names(teamSpokes),
    names(peerSpokes).filter((_, i) => i % 2 === 0),
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
    [[C, 528, "markdown, in git, on your server"]],
  ],
});
