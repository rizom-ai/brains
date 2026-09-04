/** @jsxImportSource react */
import type { JSX } from "react";
import type { CartesianMapBlock } from "./public-card-data";

const WIDTH = 820;
const HEIGHT = 480;
const PAD_X = 76;
const PAD_Y = 58;
const MAX_TERRITORIES = 18;
const INDEX_TERRITORIES = 8;
const LABELED_TERRITORIES = 7;

type CartesianZone = CartesianMapBlock["zones"][number];
type CartesianPoint = CartesianMapBlock["points"][number];

interface MapPosition {
  x: number;
  y: number;
}

interface TerritoryPosition {
  zone: CartesianZone;
  rank: number;
  radius: number;
  anchor: MapPosition;
  center: MapPosition;
}

interface TerritoryThread {
  id: string;
  source: MapPosition;
  target: MapPosition;
  bend: number;
}

interface AtlasLayout {
  territories: TerritoryPosition[];
  pointPositions: Map<string, MapPosition>;
  threads: TerritoryThread[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function position(x: number, y: number): MapPosition {
  return {
    x: PAD_X + clamp(x, 0, 1) * (WIDTH - PAD_X * 2),
    y: PAD_Y + clamp(y, 0, 1) * (HEIGHT - PAD_Y * 2),
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
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2;
    const wobble = 0.9 + ((hash(`${id}:${index}`) % 100) / 100) * 0.2;
    return {
      x: center.x + Math.cos(angle) * radius * wobble,
      y: center.y + Math.sin(angle) * radius * wobble * 0.68,
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

function territoryRadius(memberCount: number): number {
  return clamp(27 + Math.sqrt(Math.max(1, memberCount)) * 10, 38, 76);
}

function sortTerritories(zones: readonly CartesianZone[]): CartesianZone[] {
  return [...zones].sort(
    (left, right) =>
      right.memberIds.length - left.memberIds.length ||
      left.label.localeCompare(right.label),
  );
}

function initialTerritories(
  zones: readonly CartesianZone[],
): TerritoryPosition[] {
  if (zones.length === 0) return [];
  const xValues = zones.map((zone) => zone.x);
  const yValues = zones.map((zone) => zone.y);
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  const spreadX = maximumX - minimumX;
  const spreadY = maximumY - minimumY;
  const compact = spreadX < 0.05 && spreadY < 0.05;

  return zones.map((zone, rank) => {
    const radius = territoryRadius(zone.memberIds.length);
    const angle =
      (rank / Math.max(1, zones.length)) * Math.PI * 2 - Math.PI / 2;
    const anchor = compact
      ? {
          x:
            WIDTH / 2 + Math.cos(angle) * Math.min(250, 80 + zones.length * 10),
          y:
            HEIGHT / 2 + Math.sin(angle) * Math.min(150, 55 + zones.length * 6),
        }
      : {
          x:
            spreadX < 0.02
              ? WIDTH / 2 + Math.cos(angle) * 170
              : PAD_X + ((zone.x - minimumX) / spreadX) * (WIDTH - PAD_X * 2),
          y:
            spreadY < 0.02
              ? HEIGHT / 2 + Math.sin(angle) * 110
              : PAD_Y + ((zone.y - minimumY) / spreadY) * (HEIGHT - PAD_Y * 2),
        };
    return {
      zone,
      rank,
      radius,
      anchor,
      center: { ...anchor },
    };
  });
}

function relaxTerritories(
  territories: TerritoryPosition[],
): TerritoryPosition[] {
  const placements = territories.map((territory) => ({
    ...territory,
    center: { ...territory.center },
  }));

  for (let iteration = 0; iteration < 80; iteration++) {
    for (let leftIndex = 0; leftIndex < placements.length; leftIndex++) {
      const left = placements[leftIndex];
      if (!left) continue;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < placements.length;
        rightIndex++
      ) {
        const right = placements[rightIndex];
        if (!right) continue;
        let dx = right.center.x - left.center.x;
        let dy = (right.center.y - left.center.y) / 0.68;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          const angle =
            ((hash(`${left.zone.id}:${right.zone.id}`) % 360) * Math.PI) / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const minimumDistance = (left.radius + right.radius) * 0.82 + 15;
        if (distance >= minimumDistance) continue;
        const push = (minimumDistance - distance) * 0.28;
        const unitX = dx / distance;
        const unitY = dy / distance;
        left.center.x -= unitX * push;
        left.center.y -= unitY * push * 0.68;
        right.center.x += unitX * push;
        right.center.y += unitY * push * 0.68;
      }
    }

    for (const placement of placements) {
      placement.center.x += (placement.anchor.x - placement.center.x) * 0.012;
      placement.center.y += (placement.anchor.y - placement.center.y) * 0.012;
      placement.center.x = clamp(
        placement.center.x,
        placement.radius + 18,
        WIDTH - placement.radius - 18,
      );
      placement.center.y = clamp(
        placement.center.y,
        placement.radius * 0.68 + 36,
        HEIGHT - placement.radius * 0.68 - 30,
      );
    }
  }

  return placements;
}

function pointPosition(
  point: CartesianPoint,
  territoriesById: ReadonlyMap<string, TerritoryPosition>,
  zonesById: ReadonlyMap<string, CartesianZone>,
): MapPosition {
  const territory = point.zoneId
    ? territoriesById.get(point.zoneId)
    : undefined;
  const zone = point.zoneId ? zonesById.get(point.zoneId) : undefined;
  if (!territory || !zone) return position(point.x, point.y);

  let dx = (point.x - zone.x) * WIDTH * 1.55;
  let dy = (point.y - zone.y) * HEIGHT * 1.55;
  if (Math.hypot(dx, dy) < 2) {
    const angle = ((hash(point.id) % 360) * Math.PI) / 180;
    const distance = 8 + (hash(`${point.id}:distance`) % 24);
    dx = Math.cos(angle) * distance;
    dy = Math.sin(angle) * distance * 0.68;
  }

  const maximumX = territory.radius * 0.86;
  const maximumY = territory.radius * 0.52;
  const normalizedDistance = Math.hypot(dx / maximumX, dy / maximumY);
  if (normalizedDistance > 1) {
    dx /= normalizedDistance;
    dy /= normalizedDistance;
  }

  return {
    x: clamp(territory.center.x + dx, 16, WIDTH - 16),
    y: clamp(territory.center.y + dy, 24, HEIGHT - 20),
  };
}

function territoryThreads(
  territories: readonly TerritoryPosition[],
): TerritoryThread[] {
  return territories.slice(1, 12).flatMap((territory) => {
    let nearest: TerritoryPosition | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of territories.slice(0, territory.rank)) {
      const distance = Math.hypot(
        territory.zone.x - candidate.zone.x,
        territory.zone.y - candidate.zone.y,
      );
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (!nearest) return [];
    return [
      {
        id: `${nearest.zone.id}:${territory.zone.id}`,
        source: nearest.center,
        target: territory.center,
        bend: ((hash(territory.zone.id) % 3) - 1) * 14,
      },
    ];
  });
}

function buildAtlasLayout(block: CartesianMapBlock): AtlasLayout {
  const sortedZones = sortTerritories(block.zones).slice(0, MAX_TERRITORIES);
  const territories = relaxTerritories(initialTerritories(sortedZones));
  const territoriesById = new Map(
    territories.map((territory) => [territory.zone.id, territory]),
  );
  const zonesById = new Map(block.zones.map((zone) => [zone.id, zone]));
  const pointPositions = new Map(
    block.points.map((point) => [
      point.id,
      pointPosition(point, territoriesById, zonesById),
    ]),
  );
  return {
    territories,
    pointPositions,
    threads: territoryThreads(territories),
  };
}

function AtlasSummary({
  entityTotal,
  sourceCount,
  territoryCount,
  current,
}: {
  entityTotal: number;
  sourceCount: number;
  territoryCount: number;
  current: boolean;
}): JSX.Element {
  return (
    <div className="knowledge-atlas-summary" aria-label="Knowledge map summary">
      <div>
        <strong>{entityTotal}</strong>
        <span>public entities held</span>
      </div>
      <div>
        <strong>{sourceCount}</strong>
        <span>mapped sources</span>
      </div>
      <div>
        <strong>{territoryCount}</strong>
        <span>territories</span>
      </div>
      <p className={current ? "is-current" : "is-waiting"}>
        <i></i>
        {current ? "Current" : "Waiting"}
      </p>
    </div>
  );
}

export function KnowledgeMapPanel({
  block,
  entityTotal,
}: {
  block: CartesianMapBlock | undefined;
  entityTotal: number;
}): JSX.Element {
  const sortedZones = block ? sortTerritories(block.zones) : [];
  const indexedZones = sortedZones.slice(0, INDEX_TERRITORIES);
  const labeledZoneIds = new Set(
    sortedZones.slice(0, LABELED_TERRITORIES).map((zone) => zone.id),
  );
  const layout = block ? buildAtlasLayout(block) : undefined;

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
          <span className="card-from">public topics · semantic atlas</span>
        </div>
        <AtlasSummary
          entityTotal={entityTotal}
          sourceCount={block?.points.length ?? 0}
          territoryCount={block?.zones.length ?? 0}
          current={block !== undefined}
        />
        <div className="knowledge-map-field map-field" data-knowledge-atlas>
          {block && layout ? (
            <>
              <div className="knowledge-map-canvas">
                <div className="knowledge-map-coordinates" aria-hidden="true">
                  <span>Context ←</span>
                  <span>→ Practice</span>
                </div>
                <svg
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  aria-labelledby="knowledge-map-title knowledge-map-description"
                >
                  <title id="knowledge-map-title">{block.label}</title>
                  <desc id="knowledge-map-description">
                    {block.description}
                  </desc>
                  {layout.threads.map((thread, index) => (
                    <path
                      className={`knowledge-weave${index < 3 ? " is-major" : ""}`}
                      key={thread.id}
                      d={`M ${thread.source.x} ${thread.source.y} Q ${(thread.source.x + thread.target.x) / 2 + thread.bend} ${(thread.source.y + thread.target.y) / 2 - thread.bend}, ${thread.target.x} ${thread.target.y}`}
                      pathLength={1}
                    />
                  ))}
                  {layout.territories.map((territory) => {
                    const { center, radius, rank, zone } = territory;
                    const isLeading = rank === 0;
                    return (
                      <g
                        className={`knowledge-zone${isLeading ? " is-active" : ""}`}
                        data-knowledge-zone={zone.id}
                        key={zone.id}
                      >
                        <path
                          className="knowledge-zone-contour"
                          d={territoryPath(zone.id, center, radius)}
                        />
                        <path
                          className="knowledge-zone-contour is-middle"
                          d={territoryPath(
                            `${zone.id}:middle`,
                            center,
                            radius * 0.74,
                          )}
                        />
                        <path
                          className="knowledge-zone-contour is-inner"
                          d={territoryPath(
                            `${zone.id}:inner`,
                            center,
                            radius * 0.46,
                          )}
                        />
                        <circle
                          className="knowledge-zone-anchor"
                          cx={center.x}
                          cy={center.y}
                          r="3"
                        />
                        {labeledZoneIds.has(zone.id) && (
                          <>
                            <text
                              className="knowledge-zone-label"
                              x={center.x}
                              y={center.y - radius * 0.72 - 8}
                              textAnchor="middle"
                            >
                              {zone.label}
                              <tspan className="knowledge-zone-count" dx="6">
                                {zone.memberIds.length}
                              </tspan>
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                  {block.points.map((point) => {
                    const center = layout.pointPositions.get(point.id);
                    if (!center) return null;
                    const kind = pointClass(point.category);
                    return (
                      <g className={`knowledge-point ${kind}`} key={point.id}>
                        <title>{`${point.label} · ${point.category}`}</title>
                        <circle
                          className="knowledge-point-mark"
                          cx={center.x}
                          cy={center.y}
                          r={
                            kind === "is-published"
                              ? 3.1
                              : kind === "is-skill"
                                ? 2.7
                                : kind === "is-signal"
                                  ? 2.2
                                  : 1.7
                          }
                        />
                      </g>
                    );
                  })}
                  <g className="knowledge-map-axis" aria-hidden="true">
                    <text x="20" y={HEIGHT - 18}>
                      Emergent
                    </text>
                    <text x={WIDTH - 20} y={HEIGHT - 18} textAnchor="end">
                      Explicit
                    </text>
                  </g>
                </svg>
              </div>
              <aside className="knowledge-territory-index">
                <header>
                  <h3>Territories</h3>
                  <p>Largest public clusters, by source count.</p>
                </header>
                <ol>
                  {indexedZones.map((zone, index) => (
                    <li key={zone.id}>
                      <button
                        type="button"
                        className={index === 0 ? "is-active" : undefined}
                        data-knowledge-zone-ref={zone.id}
                        aria-pressed={index === 0 ? "true" : "false"}
                        title={zone.label}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{zone.label}</strong>
                        <b>{zone.memberIds.length}</b>
                      </button>
                    </li>
                  ))}
                </ol>
                {sortedZones.length > indexedZones.length && (
                  <p className="knowledge-index-more">
                    + {sortedZones.length - indexedZones.length} smaller
                    territories
                  </p>
                )}
                <p className="knowledge-index-note">
                  Hover or focus a territory to trace its contour. The map stays
                  quiet until you ask for detail.
                </p>
              </aside>
            </>
          ) : (
            <div className="map-empty">
              The public knowledge map will grow as topics are indexed.
            </div>
          )}
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
