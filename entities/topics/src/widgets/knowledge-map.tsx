/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { WidgetComponentProps } from "@brains/dashboard";
import knowledgeMapStyles from "./knowledge-map.css" with { type: "text" };
import {
  knowledgeMapDataSchema,
  type KnowledgeMapData,
  type KnowledgeMapPoint,
  type KnowledgeMapZone,
} from "../lib/knowledge-map-data";

export { knowledgeMapStyles };

/**
 * The knowledge map renderer (docs/plans/knowledge-map.md, phase 2): the
 * corpus as a centerless sky. Topics are soft-bounded blob territories
 * (mist + dashed border + floating label), published work glows, skills
 * are moss, notes are pearls, operational entities are ground spores.
 * Deterministic by construction — static site builds must not churn.
 */

const WIDTH = 1000;
const HEIGHT = 560;
const PAD = 60;
/** How many zone labels the sky can carry before empty zones go quiet. */
const LABEL_BUDGET = 8;

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toPx(x: number, y: number): { x: number; y: number } {
  return {
    x: PAD + x * (WIDTH - 2 * PAD),
    y: PAD + y * (HEIGHT - 2 * PAD),
  };
}

/** A wobbly closed blob around a centroid — a territory, not a UI circle. */
function blobPath(cx: number, cy: number, base: number, seed: number): string {
  const rng = mulberry32(seed);
  const corners = 9;
  const points: [number, number][] = [];
  for (let i = 0; i < corners; i++) {
    const angle = (i / corners) * Math.PI * 2;
    const radius = base * (0.82 + rng() * 0.4);
    points.push([
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius * 0.86,
    ]);
  }
  const first = points[0];
  const last = points[corners - 1];
  if (!first || !last) return "";
  let d = `M ${(first[0] + last[0]) / 2} ${(first[1] + last[1]) / 2}`;
  for (let i = 0; i < corners; i++) {
    const current = points[i];
    const next = points[(i + 1) % corners];
    if (!current || !next) continue;
    d += ` Q ${current[0]} ${current[1]}, ${(current[0] + next[0]) / 2} ${(current[1] + next[1]) / 2}`;
  }
  return `${d} Z`;
}

interface ZoneLayout {
  zone: KnowledgeMapZone;
  cx: number;
  cy: number;
  base: number;
  path: string;
  labeled: boolean;
}

function layoutZones(data: KnowledgeMapData): ZoneLayout[] {
  const pointById = new Map(data.points.map((point) => [point.id, point]));
  const layouts = data.zones.map((zone, index) => {
    const members = zone.memberIds
      .map((id) => pointById.get(id))
      .filter((point): point is KnowledgeMapPoint => point !== undefined);
    let { x: cx, y: cy } = toPx(zone.x, zone.y);
    for (const member of members) {
      const p = toPx(member.x, member.y);
      cx += p.x;
      cy += p.y;
    }
    cx /= members.length + 1;
    cy /= members.length + 1;
    const base = members.length
      ? Math.max(
          ...members.map((member) => {
            const p = toPx(member.x, member.y);
            return Math.hypot(p.x - cx, p.y - cy);
          }),
        ) + 30
      : 24 + (index % 3) * 4;
    return {
      zone,
      cx,
      cy,
      base,
      path: blobPath(cx, cy, base, 40 + index),
      labeled: false,
    };
  });

  // Zones holding members always carry their names; empty zones only while
  // the sky stays uncrowded.
  let budget = LABEL_BUDGET;
  for (const layout of layouts) {
    if (layout.zone.memberIds.length > 0 && budget > 0) {
      layout.labeled = true;
      budget--;
    }
  }
  for (const layout of layouts) {
    if (!layout.labeled && budget > 0) {
      layout.labeled = true;
      budget--;
    }
  }
  return layouts;
}

function ZoneShape({
  layout,
  index,
  surface,
}: {
  layout: ZoneLayout;
  index: number;
  surface: string;
}): JSX.Element {
  const { zone, cx, cy, base, path, labeled } = layout;
  const count = zone.memberIds.length;
  return (
    <g>
      <path d={path} fill={`url(#kmap-mist-${surface})`} />
      <path
        class="kmap-weave"
        pathLength={1}
        d={path}
        fill="none"
        stroke="var(--kmap-zone)"
        stroke-opacity={0.32}
        stroke-width={1.2}
        stroke-dasharray="3 5"
        stroke-linecap="round"
        style={`--d:${(0.2 + index * 0.08).toFixed(2)}s`}
      />
      {labeled && (
        <text
          class="kmap-label kmap-label--zone"
          x={cx}
          y={cy - base - 8}
          text-anchor="middle"
          fill="var(--kmap-zone)"
          font-size="11"
          font-weight="600"
          letter-spacing="0.18em"
          style={`--d:${(1 + index * 0.08).toFixed(2)}s;text-transform:uppercase`}
        >
          {count > 0 ? `${zone.name} · ${count}` : zone.name}
        </text>
      )}
    </g>
  );
}

function PointShape({
  point,
  index,
  surface,
}: {
  point: KnowledgeMapPoint;
  index: number;
  surface: string;
}): JSX.Element {
  const { x, y } = toPx(point.x, point.y);
  const delay = (0.5 + index * 0.05).toFixed(2);
  if (point.kind === "published") {
    const anchor = x > WIDTH - 200 ? "end" : "start";
    const offset = anchor === "start" ? 14 : -14;
    return (
      <g class="kmap-point--published">
        <circle
          class="kmap-dot kmap-breathe"
          cx={x}
          cy={y}
          r={15}
          fill="var(--kmap-glow)"
          opacity={0.12}
          filter={`url(#kmap-blur-${surface})`}
          style={`--d:${delay}s`}
        />
        <circle
          class="kmap-dot"
          cx={x}
          cy={y}
          r={5}
          fill="var(--kmap-glow)"
          style={`--d:${delay}s`}
        />
        <circle
          class="kmap-dot"
          cx={x}
          cy={y}
          r={2.1}
          fill="var(--kmap-hot)"
          opacity={0.9}
          style={`--d:${delay}s`}
        />
        <text
          class="kmap-label kmap-label--point"
          x={x + offset}
          y={y + 4}
          text-anchor={anchor}
          fill="var(--kmap-ink-dim)"
          font-size="10.5"
          letter-spacing="0.06em"
          style={`--d:${(1.3 + index * 0.05).toFixed(2)}s`}
        >
          {point.title}
        </text>
      </g>
    );
  }
  if (point.kind === "skill") {
    return (
      <circle
        class="kmap-dot kmap-point--skill"
        cx={x}
        cy={y}
        r={3.4}
        fill="var(--kmap-skill)"
        style={`--d:${delay}s`}
      />
    );
  }
  if (point.kind === "pearl") {
    return (
      <circle
        class="kmap-dot kmap-point--pearl"
        cx={x}
        cy={y}
        r={2.8}
        fill="none"
        stroke="var(--kmap-ink-dim)"
        stroke-width={1.3}
        style={`--d:${delay}s`}
      />
    );
  }
  return (
    <circle
      class="kmap-dot kmap-point--ground"
      cx={x}
      cy={y}
      r={1.5}
      fill="var(--kmap-ink-faint)"
      style={`--d:${(1.4 + index * 0.03).toFixed(2)}s`}
    />
  );
}

export function KnowledgeMap({
  data,
  surface = "dashboard",
}: {
  data: KnowledgeMapData;
  surface?: "dashboard" | "site";
}): JSX.Element {
  const zones = layoutZones(data);
  // Ground first so territories and lights paint over the spores.
  const points = [...data.points].sort(
    (a, b) => (a.kind === "ground" ? 0 : 1) - (b.kind === "ground" ? 0 : 1),
  );
  return (
    <svg
      class={`kmap kmap--${surface}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="What this brain knows, mapped in semantic space"
    >
      <defs>
        <filter
          id={`kmap-blur-${surface}`}
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id={`kmap-mist-${surface}`}>
          <stop offset="0%" stop-color="var(--kmap-zone)" stop-opacity="0.13" />
          <stop
            offset="70%"
            stop-color="var(--kmap-zone)"
            stop-opacity="0.05"
          />
          <stop offset="100%" stop-color="var(--kmap-zone)" stop-opacity="0" />
        </radialGradient>
      </defs>
      {zones.map((layout, index) => (
        <ZoneShape
          key={layout.zone.id}
          layout={layout}
          index={index}
          surface={surface}
        />
      ))}
      {points.map((point, index) => (
        <PointShape
          key={point.id}
          point={point}
          index={index}
          surface={surface}
        />
      ))}
    </svg>
  );
}

/** The dashboard face of the map — parses widget data, falls back quietly. */
export function KnowledgeMapWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = knowledgeMapDataSchema.safeParse(data);
  if (!parsed.success) return <p class="muted">Nothing to show yet.</p>;
  return <KnowledgeMap data={parsed.data} />;
}
