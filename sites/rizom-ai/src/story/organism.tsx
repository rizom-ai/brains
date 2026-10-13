/** @jsxImportSource react */
import type { JSX } from "react";

/**
 * A continuous drawing: one set of nodes and threads that rearranges per
 * stage. Positions are generated into per-stage CSS, so the browser eases
 * every node and thread from one arrangement to the next.
 */

/** A node's place at one stage: x, y, radius, opacity (0–1) in a 600×600 box. */
export type NodePlace = readonly [number, number, number, number];
/** A thread: id, from node, to node, bend (0 is straight). */
export type Thread = readonly [string, string, string, number];
/** A label: x, y, text, anchor (middle by default). */
export type Label = readonly [
  number,
  number,
  string,
  ("start" | "middle" | "end")?,
];
/** What a node is drawn as. */
export type NodeKind = "" | "lantern" | "doc" | "hollow" | "lit";

export interface OrganismSpec {
  /** Prefix for the figure class and element ids. */
  id: string;
  /** Per stage, node id → place. A node absent from a stage waits, unseen, where it next appears. */
  stages: ReadonlyArray<Readonly<Record<string, NodePlace>>>;
  links: readonly Thread[];
  /** Per stage, the threads drawn. */
  visible: ReadonlyArray<readonly string[]>;
  /** Per stage, the threads a pulse travels along. */
  flowing: ReadonlyArray<readonly string[]>;
  labels: ReadonlyArray<readonly Label[]>;
  kinds?: Readonly<Record<string, NodeKind>>;
}

export interface Organism {
  svg(): JSX.Element;
  css(): string;
  stageCount: number;
}

const SIZE = 600;
const r1 = (v: number): number => Math.round(v * 10) / 10;
const NEAR = [1, -1, 2, -2, 3, -3];

export function organism(spec: OrganismSpec): Organism {
  const { id: P, stages, links, visible, flowing, labels } = spec;
  const kinds = spec.kinds ?? {};
  const nodes = Array.from(new Set(stages.flatMap((s) => Object.keys(s))));

  const place = (stage: number, node: string): NodePlace => {
    const own = stages[stage]?.[node];
    if (own) return own;
    const near = NEAR.map((d) => stage + d).find((s) => stages[s]?.[node]);
    const next = near === undefined ? undefined : stages[near]?.[node];
    const [x, y] = next ?? [SIZE / 2, SIZE / 2];
    return [x, y, 0, 0];
  };

  const pathFor = (stage: number, [, from, to, bend]: Thread): string => {
    const [x1, y1] = place(stage, from);
    const [x2, y2] = place(stage, to);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return `M${r1(x1)} ${r1(y1)} Q${r1(mx - (dy / len) * bend)} ${r1(my + (dx / len) * bend)} ${r1(x2)} ${r1(y2)}`;
  };

  const svg = (): JSX.Element => (
    <div className="o-box">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {links.map((link) => (
          <path
            key={`l-${link[0]}`}
            id={`${P}-l-${link[0]}`}
            className="o-thread"
            pathLength={1}
            d={pathFor(0, link)}
          />
        ))}
        {links.map((link) => (
          <path
            key={`f-${link[0]}`}
            id={`${P}-f-${link[0]}`}
            className="o-flow"
            pathLength={1}
            d={pathFor(0, link)}
          />
        ))}
        {nodes.map((node) => {
          const [x, y, r] = place(0, node);
          const kind = kinds[node] ?? "";
          if (kind === "lantern") {
            return (
              <g key={node}>
                <circle
                  id={`${P}-g-${node}`}
                  className="o-glow"
                  cx={x}
                  cy={y}
                  r={r * 5}
                />
                <circle
                  id={`${P}-n-${node}`}
                  className="o-lantern"
                  cx={x}
                  cy={y}
                  r={r}
                />
              </g>
            );
          }
          if (kind === "doc") {
            return (
              <g key={node} id={`${P}-n-${node}`} className="o-doc">
                <rect x={-11} y={-14} width={22} height={28} rx={2} />
                <line x1={-6} y1={-6} x2={6} y2={-6} />
                <line x1={-6} y1={-1} x2={4} y2={-1} />
                <line x1={-6} y1={4} x2={2} y2={4} />
              </g>
            );
          }
          return (
            <circle
              key={node}
              id={`${P}-n-${node}`}
              className={kind ? `o-node ${kind}` : "o-node"}
              cx={x}
              cy={y}
              r={r}
            />
          );
        })}
      </svg>
      {labels.map((set, stage) => (
        <ol key={stage} className="o-names" data-for={stage}>
          {set.map(([x, y, text, anchor = "middle"]) => (
            <li
              key={`${x}-${y}-${text}`}
              className={`o-name o-name--${anchor}`}
              style={{
                left: `${r1((x / SIZE) * 100)}%`,
                top: `${r1((y / SIZE) * 100)}%`,
              }}
            >
              {text}
            </li>
          ))}
        </ol>
      ))}
    </div>
  );

  const css = (): string =>
    stages
      .map((_, stage) => {
        const sel = `.${P}[data-stage="${stage}"]`;
        const nodeRules = nodes.map((node) => {
          const [x, y, r, o] = place(stage, node);
          const kind = kinds[node] ?? "";
          if (kind === "doc") {
            return `${sel} #${P}-n-${node} { --x: ${r1(x)}px; --y: ${r1(y)}px; opacity: ${o}; transform: translate(var(--x), var(--y)) scale(${o ? 1 : 0.6}); }`;
          }
          const base = `${sel} #${P}-n-${node} { cx: ${r1(x)}px; cy: ${r1(y)}px; r: ${r1(r)}px; opacity: ${o}; }`;
          return kind === "lantern"
            ? `${base}\n${sel} #${P}-g-${node} { cx: ${r1(x)}px; cy: ${r1(y)}px; r: ${r1(r * 5)}px; opacity: ${o ? 0.18 : 0}; }`
            : base;
        });
        const linkRules = links.map((link) => {
          const on = visible[stage]?.includes(link[0]) ?? false;
          const flows = flowing[stage]?.includes(link[0]) ?? false;
          const d = `d: path("${pathFor(stage, link)}");`;
          return `${sel} #${P}-l-${link[0]} { ${d} opacity: ${on ? 1 : 0}; stroke-dashoffset: ${on ? 0 : 1}; }\n${sel} #${P}-f-${link[0]} { ${d} opacity: ${flows ? 1 : 0}; }`;
        });
        return [
          ...nodeRules,
          ...linkRules,
          `${sel} .o-names[data-for="${stage}"] { opacity: 1; }`,
        ].join("\n");
      })
      .join("\n");

  return { svg, css, stageCount: stages.length };
}

/** Helpers for writing specs. */
export const ring = (
  n: number,
  r: number,
  start: number,
  cx: number = SIZE / 2,
  cy: number = SIZE / 2,
): [number, number][] =>
  Array.from({ length: n }, (_, i) => [
    cx + Math.cos(start + (i / n) * Math.PI * 2) * r,
    cy + Math.sin(start + (i / n) * Math.PI * 2) * r,
  ]);
/** A deterministic scatter in 0–1, so a drawing is the same on every build. */
export const scatter = (n: number): number => {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};
export const placed = (
  points: readonly (readonly [number, number])[],
  prefix: string,
  r: number = 5,
  opacity: number = 1,
): Record<string, NodePlace> =>
  Object.fromEntries(
    points.map((p, i) => [`${prefix}${i}`, [p[0], p[1], r, opacity] as const]),
  );
export const gathered = (
  points: readonly unknown[],
  prefix: string,
  at: readonly [number, number],
): Record<string, NodePlace> =>
  Object.fromEntries(
    points.map((_, i) => [`${prefix}${i}`, [at[0], at[1], 4, 0] as const]),
  );
