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
 * The knowledge map renderer: the corpus as a centerless sky. Topics are
 * soft-bounded blob territories (mist + dashed border + floating label),
 * published work glows, skills are moss, notes are pearls, operational
 * entities are ground spores. Deterministic by construction — static site
 * builds must not churn.
 */

const WIDTH = 1100;
const HEIGHT = 560;
const PAD = 60;
/** How many zone labels the sky can carry before empty zones go quiet. */
const LABEL_BUDGET = 7;
const UNFILED_LABEL_BUDGET = 4;
const LABEL_HEIGHT = 18;
/** Rough mono glyph advance at the label sizes — enough for collision boxes. */
const LABEL_CHAR_WIDTH = 7.5;

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

interface LabelLeader {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LabelPlacement {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  leader: LabelLeader | null;
}

interface ZoneLayout {
  zone: KnowledgeMapZone;
  cx: number;
  cy: number;
  base: number;
  path: string;
  label: LabelPlacement | null;
}

function layoutZones(data: KnowledgeMapData): {
  layouts: ZoneLayout[];
  placed: LabelBox[];
} {
  const pointById = new Map(data.points.map((point) => [point.id, point]));
  const layouts: ZoneLayout[] = data.zones.map((zone, index) => {
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
      : 14 + (index % 3) * 3;
    return {
      zone,
      cx,
      cy,
      base,
      path: blobPath(cx, cy, base, 40 + index),
      label: null,
    };
  });

  // Text discipline: only territories that hold knowledge get a name, up
  // to a budget, and a label whose box would collide with an already
  // placed one stays quiet. Empty zones are silent rings; published
  // lights carry no titles at all — the glow is the statement, the names
  // live in the console.
  const placed: LabelBox[] = [];
  let budget = LABEL_BUDGET;
  const labelCandidates = layouts
    .map((layout, index) => ({
      layout,
      index,
      priority: getZoneLabelPriority(layout.zone, pointById),
    }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index);
  for (const candidate of labelCandidates) {
    const { layout } = candidate;
    if (layout.zone.memberIds.length === 0) continue;
    if (budget <= 0) break;
    const text = `${layout.zone.name} · ${layout.zone.memberIds.length}`;
    const placement = chooseLabelPlacement(layout, text, placed);
    if (!placement) continue;
    placed.push(placement.box);
    layout.label = placement.label;
    budget--;
  }
  return { layouts, placed };
}

function getZoneLabelPriority(
  zone: KnowledgeMapZone,
  pointById: Map<string, KnowledgeMapPoint>,
): number {
  const members = zone.memberIds
    .map((id) => pointById.get(id))
    .filter((point): point is KnowledgeMapPoint => point !== undefined);
  const published = members.filter(
    (point) => point.kind === "published",
  ).length;
  return members.length * 10 + published * 3;
}

interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function labelBox(
  x: number,
  y: number,
  width: number,
  anchor: LabelPlacement["anchor"],
): LabelBox {
  return {
    x:
      anchor === "start"
        ? x - 6
        : anchor === "end"
          ? x - width - 6
          : x - width / 2 - 6,
    y: y - LABEL_HEIGHT / 2 - 2,
    w: width + 12,
    h: LABEL_HEIGHT + 4,
  };
}

function isInFrame(box: LabelBox): boolean {
  return (
    box.x >= 26 &&
    box.y >= 26 &&
    box.x + box.w <= WIDTH - 26 &&
    box.y + box.h <= HEIGHT - 28
  );
}

function labelCandidates(
  layout: ZoneLayout,
  textWidth: number,
): LabelPlacement[] {
  const side = layout.cx < WIDTH / 2 ? -1 : 1;
  const half = textWidth / 2;
  const internalOk = layout.base > Math.max(38, half * 0.62);
  const candidates: LabelPlacement[] = [];

  if (internalOk) {
    candidates.push(
      { x: layout.cx, y: layout.cy + 3, anchor: "middle", leader: null },
      {
        x: layout.cx,
        y: layout.cy - layout.base * 0.34,
        anchor: "middle",
        leader: null,
      },
    );
  }

  candidates.push(
    {
      x: layout.cx + side * (layout.base + 18),
      y: layout.cy + 4,
      anchor: side > 0 ? "start" : "end",
      leader: {
        x1: layout.cx + side * (layout.base * 0.74),
        y1: layout.cy + 2,
        x2: layout.cx + side * (layout.base + 10),
        y2: layout.cy + 2,
      },
    },
    {
      x: layout.cx,
      y: layout.cy - layout.base - 13,
      anchor: "middle",
      leader: {
        x1: layout.cx,
        y1: layout.cy - layout.base * 0.72,
        x2: layout.cx,
        y2: layout.cy - layout.base - 5,
      },
    },
    {
      x: layout.cx,
      y: layout.cy + layout.base + 18,
      anchor: "middle",
      leader: {
        x1: layout.cx,
        y1: layout.cy + layout.base * 0.72,
        x2: layout.cx,
        y2: layout.cy + layout.base + 8,
      },
    },
    {
      x: layout.cx - side * (layout.base + 18),
      y: layout.cy + 4,
      anchor: side > 0 ? "end" : "start",
      leader: {
        x1: layout.cx - side * (layout.base * 0.74),
        y1: layout.cy + 2,
        x2: layout.cx - side * (layout.base + 10),
        y2: layout.cy + 2,
      },
    },
  );

  return candidates;
}

function chooseLabelPlacement(
  layout: ZoneLayout,
  text: string,
  placed: LabelBox[],
): { label: LabelPlacement; box: LabelBox } | null {
  const width = text.length * LABEL_CHAR_WIDTH;
  for (const candidate of labelCandidates(layout, width)) {
    const box = labelBox(candidate.x, candidate.y, width, candidate.anchor);
    if (!isInFrame(box)) continue;
    if (placed.some((other) => intersects(box, other))) continue;
    return { label: candidate, box };
  }
  return null;
}

function intersects(a: LabelBox, b: LabelBox): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

interface ZoneLink {
  first: ZoneLayout;
  second: ZoneLayout;
  path: string;
}

function buildZoneLinks(layouts: ZoneLayout[]): ZoneLink[] {
  const random = mulberry32(211);
  return layouts
    .flatMap((first, leftIndex) =>
      layouts.slice(leftIndex + 1).map((second) => ({
        first,
        second,
        distance: Math.hypot(second.cx - first.cx, second.cy - first.cy),
      })),
    )
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 8)
    .map(({ first, second }) => {
      const middleX = (first.cx + second.cx) / 2 + (random() - 0.5) * 34;
      const middleY = (first.cy + second.cy) / 2 + (random() - 0.5) * 34;
      return {
        first,
        second,
        path: `M ${first.cx} ${first.cy} Q ${middleX} ${middleY}, ${second.cx} ${second.cy}`,
      };
    });
}

function ZoneLinkShape({
  link,
  index,
}: {
  link: ZoneLink;
  index: number;
}): JSX.Element {
  return (
    <path
      class="kmap-weave kmap-topic-link"
      pathLength={1}
      d={link.path}
      fill="none"
      stroke="var(--kmap-glow)"
      stroke-opacity={0.11}
      stroke-width={0.75}
      style={`--d:${(1.15 + index * 0.11).toFixed(2)}s`}
    />
  );
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
  const { zone, path, label } = layout;
  const count = zone.memberIds.length;
  return (
    <g>
      {count > 0 && <path d={path} fill={`url(#kmap-mist-${surface})`} />}
      <path
        class="kmap-weave"
        pathLength={1}
        d={path}
        fill="none"
        stroke="var(--kmap-zone)"
        stroke-opacity={0.32}
        stroke-width={1}
        stroke-dasharray="3 5"
        stroke-linecap="round"
        style={`--d:${(0.2 + index * 0.08).toFixed(2)}s`}
      />
      {label?.leader && (
        <path
          class="kmap-weave kmap-label-leader"
          pathLength={1}
          d={`M ${label.leader.x1} ${label.leader.y1} L ${label.leader.x2} ${label.leader.y2}`}
          fill="none"
          stroke="var(--kmap-zone)"
          stroke-opacity={0.34}
          stroke-width={0.7}
          stroke-linecap="round"
          style={`--d:${(0.9 + index * 0.08).toFixed(2)}s`}
        />
      )}
      {label && (
        <text
          class="kmap-label kmap-label--zone"
          x={label.x}
          y={label.y}
          text-anchor={label.anchor}
          fill="var(--kmap-zone)"
          font-size="9"
          font-weight="600"
          letter-spacing="0.18em"
          style={`--d:${(0.95 + index * 0.08).toFixed(2)}s;text-transform:uppercase`}
        >
          {count > 0 ? `${zone.name} · ${count}` : zone.name}
        </text>
      )}
    </g>
  );
}

function unfiledLabelAnchor(x: number): {
  anchor: "start" | "end";
  dx: number;
} {
  const anchor = x > WIDTH - 150 ? "end" : "start";
  return { anchor, dx: anchor === "start" ? 11 : -11 };
}

function UnfiledPointShape({
  point,
  index,
  surface,
  showLabel,
}: {
  point: KnowledgeMapPoint;
  index: number;
  surface: string;
  showLabel: boolean;
}): JSX.Element {
  const { x, y } = toPx(point.x, point.y);
  const delay = (0.5 + index * 0.05).toFixed(2);
  const { anchor, dx } = unfiledLabelAnchor(x);
  return (
    <g class={`kmap-point--${point.kind} kmap-point--unfiled`}>
      <circle
        class="kmap-dot kmap-breathe"
        cx={x}
        cy={y}
        r={10.4}
        fill={`url(#kmap-unfiled-${surface})`}
        opacity={0.28}
        style={`--d:${delay}s`}
      />
      <circle
        class="kmap-dot"
        cx={x}
        cy={y}
        r={3.2}
        fill="var(--kmap-unfiled)"
        opacity={0.72}
        style={`--d:${delay}s`}
      />
      {showLabel && (
        <text
          class="kmap-label kmap-label--unfiled"
          x={x + dx}
          y={y + 3.5}
          text-anchor={anchor}
          fill="var(--kmap-label-dim)"
          font-size="9"
          letter-spacing="0.06em"
          style={`--d:${(1.3 + index * 0.05).toFixed(2)}s`}
        >
          {point.title} · unfiled
        </text>
      )}
    </g>
  );
}

function PointShape({
  point,
  index,
  surface,
  showUnfiledLabel = false,
}: {
  point: KnowledgeMapPoint;
  index: number;
  surface: string;
  showUnfiledLabel?: boolean;
}): JSX.Element {
  const { x, y } = toPx(point.x, point.y);
  const delay = (0.5 + index * 0.05).toFixed(2);
  if (point.zoneId === null && point.kind !== "ground") {
    return (
      <UnfiledPointShape
        point={point}
        index={index}
        surface={surface}
        showLabel={showUnfiledLabel}
      />
    );
  }
  if (point.kind === "published") {
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

function KnowledgeMapLegend(): JSX.Element {
  const items = [
    { label: "topic zones", kind: "zone" },
    { label: "published", kind: "published" },
    { label: "skills", kind: "skill" },
    { label: "references", kind: "pearl" },
    { label: "unfiled", kind: "unfiled" },
    { label: "operational", kind: "ground" },
  ] as const;
  return (
    <g class="kmap-legend" aria-hidden="true">
      {items.map((item, index) => {
        const x = 560 + index * 82;
        const y = HEIGHT - 23;
        return (
          <g key={item.label} transform={`translate(${x} ${y})`}>
            {item.kind === "zone" ? (
              <circle
                cx={0}
                cy={0}
                r={4}
                fill="none"
                stroke="var(--kmap-zone)"
                stroke-width={1.1}
                stroke-dasharray="2 2"
              />
            ) : item.kind === "published" ? (
              <circle cx={0} cy={0} r={4} fill="var(--kmap-glow)" />
            ) : item.kind === "skill" ? (
              <circle cx={0} cy={0} r={3.4} fill="var(--kmap-skill)" />
            ) : item.kind === "pearl" ? (
              <circle
                cx={0}
                cy={0}
                r={3.5}
                fill="none"
                stroke="var(--kmap-ink-dim)"
                stroke-width={1.1}
              />
            ) : item.kind === "unfiled" ? (
              <circle cx={0} cy={0} r={3.2} fill="var(--kmap-unfiled)" />
            ) : (
              <circle cx={0} cy={0} r={2.2} fill="var(--kmap-ink-faint)" />
            )}
            <text x={9} y={3.5} class="kmap-label kmap-label--legend">
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function KnowledgeMap({
  data,
  surface = "dashboard",
}: {
  data: KnowledgeMapData;
  surface?: "dashboard" | "site";
}): JSX.Element {
  const { layouts: zones } = layoutZones(data);
  const zoneLinks = buildZoneLinks(zones);
  const titleId = `kmap-title-${surface}`;
  const descId = `kmap-desc-${surface}`;
  const labeledZones = zones
    .filter((layout) => layout.label)
    .map((layout) => layout.zone.name)
    .slice(0, 4);
  const desc = `Semantic knowledge map with ${data.counts.entities} entities and ${data.counts.topics} topics. Labeled territories include ${labeledZones.join(", ") || "none yet"}. Published work glows, skills are moss, references are pearls, unfiled evidence is cyan, and operational entities are ground spores.`;
  const groundPoints = data.points.filter((point) => point.kind === "ground");
  const evidencePoints = data.points.filter((point) => point.kind !== "ground");
  const labeledUnfiledIds = new Set(
    evidencePoints
      .filter((point) => point.zoneId === null)
      .slice(0, UNFILED_LABEL_BUDGET)
      .map((point) => point.id),
  );
  return (
    <svg
      class={`kmap kmap--${surface}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
    >
      <title id={titleId}>Knowledge map</title>
      <desc id={descId}>{desc}</desc>
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
          <stop offset="0%" stop-color="var(--kmap-zone)" stop-opacity="0.25" />
          <stop
            offset="70%"
            stop-color="var(--kmap-zone)"
            stop-opacity="0.09"
          />
          <stop offset="100%" stop-color="var(--kmap-zone)" stop-opacity="0" />
        </radialGradient>
        <radialGradient id={`kmap-unfiled-${surface}`}>
          <stop
            offset="0%"
            stop-color="var(--kmap-unfiled)"
            stop-opacity="0.75"
          />
          <stop
            offset="100%"
            stop-color="var(--kmap-unfiled)"
            stop-opacity="0"
          />
        </radialGradient>
      </defs>
      {groundPoints.map((point, index) => (
        <PointShape
          key={point.id}
          point={point}
          index={index}
          surface={surface}
        />
      ))}
      {zoneLinks.map((link, index) => (
        <ZoneLinkShape
          key={`${link.first.zone.id}:${link.second.zone.id}`}
          link={link}
          index={index}
        />
      ))}
      {zones.map((layout, index) => (
        <ZoneShape
          key={layout.zone.id}
          layout={layout}
          index={index}
          surface={surface}
        />
      ))}
      {evidencePoints.map((point, index) => (
        <PointShape
          key={point.id}
          point={point}
          index={index}
          surface={surface}
          showUnfiledLabel={labeledUnfiledIds.has(point.id)}
        />
      ))}
      <KnowledgeMapLegend />
    </svg>
  );
}

/** The dashboard face of the map — parses widget data, falls back quietly. */
export function KnowledgeMapWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = knowledgeMapDataSchema.safeParse(data);
  if (!parsed.success) return <p class="muted">Nothing to show yet.</p>;
  return (
    <div class="kmap-field kmap-field--dashboard">
      <KnowledgeMap data={parsed.data} />
    </div>
  );
}
