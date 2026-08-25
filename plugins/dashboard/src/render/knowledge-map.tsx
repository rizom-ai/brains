/** @jsxImportSource react */
import type { JSX } from "react";
import type { CartesianMapBlock } from "./public-card-data";

const WIDTH = 1_100;
const HEIGHT = 560;
const PAD_X = 70;
const PAD_Y = 54;

interface MapPosition {
  x: number;
  y: number;
}

function position(x: number, y: number): MapPosition {
  return {
    x: PAD_X + Math.max(0, Math.min(1, x)) * (WIDTH - PAD_X * 2),
    y: PAD_Y + Math.max(0, Math.min(1, y)) * (HEIGHT - PAD_Y * 2),
  };
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function territoryPath(
  id: string,
  center: MapPosition,
  radius: number,
): string {
  const points = Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2;
    const wobble = 0.82 + ((hash(`${id}:${index}`) % 100) / 100) * 0.35;
    return {
      x: center.x + Math.cos(angle) * radius * wobble,
      y: center.y + Math.sin(angle) * radius * wobble * 0.72,
    };
  });
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return "";
  let path = `M ${(first.x + last.x) / 2} ${(first.y + last.y) / 2}`;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    path += ` Q ${current.x} ${current.y}, ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  return `${path} Z`;
}

function pointClass(category: string): string {
  if (category === "published") return "is-published";
  if (category === "skill") return "is-skill";
  if (category === "high-signal") return "is-signal";
  return "is-source";
}

export function KnowledgeMapPanel({
  block,
  entityTotal,
}: {
  block: CartesianMapBlock | undefined;
  entityTotal: number;
}): JSX.Element {
  const positions = new Map<string, MapPosition>();
  for (const zone of block?.zones ?? []) {
    positions.set(zone.id, position(zone.x, zone.y));
  }
  for (const point of block?.points ?? []) {
    positions.set(point.id, position(point.x, point.y));
  }

  return (
    <section
      id="knowledge"
      className="dashboard-tab-panel card-map-panel"
      data-dashboard-tab-panel
      data-card-map="knowledge"
      data-ui-panel="knowledge"
      role="tabpanel"
      aria-labelledby="dashboard-tab-knowledge"
    >
      <header className="tab-section-head">
        <h2>Knowledge</h2>
      </header>
      <article className="card map-card">
        <div className="card-head">
          <span className="card-title">Knowledge map</span>
          <span className="card-from">public topics · semantic space</span>
        </div>
        <div className="knowledge-map-field map-field">
          {block ? (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-labelledby="knowledge-map-title knowledge-map-description"
            >
              <title id="knowledge-map-title">{block.label}</title>
              <desc id="knowledge-map-description">{block.description}</desc>
              <defs>
                <radialGradient id="knowledge-zone-mist">
                  <stop
                    offset="0%"
                    stopColor="var(--console-secondary)"
                    stopOpacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--console-secondary)"
                    stopOpacity="0"
                  />
                </radialGradient>
                <filter
                  id="knowledge-glow"
                  x="-80%"
                  y="-80%"
                  width="260%"
                  height="260%"
                >
                  <feGaussianBlur stdDeviation="4" />
                </filter>
              </defs>
              {(block.relationships ?? []).map((relationship, index) => {
                const source = positions.get(relationship.sourceId);
                const target = positions.get(relationship.targetId);
                if (!source || !target) return null;
                const bend = ((index % 3) - 1) * 16;
                return (
                  <path
                    className="knowledge-weave"
                    key={`${relationship.sourceId}:${relationship.targetId}`}
                    d={`M ${source.x} ${source.y} Q ${(source.x + target.x) / 2 + bend} ${(source.y + target.y) / 2 - bend}, ${target.x} ${target.y}`}
                    pathLength={1}
                  />
                );
              })}
              {block.zones.map((zone) => {
                const center = positions.get(zone.id);
                if (!center) return null;
                const radius = 34 + Math.sqrt(zone.memberIds.length + 1) * 22;
                return (
                  <g className="knowledge-zone" key={zone.id}>
                    <path
                      d={territoryPath(zone.id, center, radius)}
                      fill="url(#knowledge-zone-mist)"
                    />
                    <path
                      className="knowledge-zone-edge"
                      d={territoryPath(zone.id, center, radius)}
                      pathLength={1}
                    />
                    <text x={center.x} y={center.y - radius * 0.62}>
                      {zone.label} · {zone.memberIds.length}
                    </text>
                  </g>
                );
              })}
              {block.points.map((point) => {
                const center = positions.get(point.id);
                if (!center) return null;
                const kind = pointClass(point.category);
                return (
                  <g className={`knowledge-point ${kind}`} key={point.id}>
                    <title>{`${point.label} · ${point.category}`}</title>
                    {kind === "is-published" && (
                      <circle
                        className="knowledge-point-glow"
                        cx={center.x}
                        cy={center.y}
                        r="17"
                        filter="url(#knowledge-glow)"
                      />
                    )}
                    <circle
                      className="knowledge-point-mark"
                      cx={center.x}
                      cy={center.y}
                      r={
                        kind === "is-published"
                          ? 5
                          : kind === "is-skill"
                            ? 4
                            : 2.5
                      }
                    />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="map-empty">
              The public knowledge map will grow as topics are indexed.
            </div>
          )}
          <div className="map-count" aria-hidden="true">
            <b>{entityTotal}</b>
            <span>public entities held</span>
          </div>
        </div>
        <div className="map-legend" aria-label="Knowledge map legend">
          {(
            block?.legend ?? [
              { label: "Topic zones" },
              { label: "Published" },
              { label: "Skills" },
              { label: "Sources" },
            ]
          ).map((item) => (
            <span className="map-legend-item" key={item.label}>
              <i
                data-kind={item.label.toLowerCase().replace(/\s+/g, "-")}
                data-tone={item.tone ?? "neutral"}
              ></i>
              {item.label}
            </span>
          ))}
          <span className="map-live">
            {block?.points.length ?? 0} sources · {block?.zones.length ?? 0}{" "}
            territories · public scope
          </span>
        </div>
      </article>
    </section>
  );
}
