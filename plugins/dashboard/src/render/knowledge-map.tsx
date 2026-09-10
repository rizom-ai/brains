/** @jsxImportSource react */
import type { JSX } from "react";
import {
  OperatorSection,
  OperatorSectionHeading,
  OperatorPanel,
  OperatorMapFrame,
  OperatorMapCanvas,
  OperatorMapCoordinates,
  OperatorMapGraphic,
  OperatorMapEmpty,
  OperatorMapSummary,
  OperatorMapIndex,
  OperatorMapIndexItem,
  OperatorMapLegend,
  OperatorMapLegendItem,
  OperatorMapLegendNote,
  OperatorMapGroup,
  OperatorMapPath,
  OperatorMapCircle,
  OperatorMapText,
  OperatorMapCount,
} from "@brains/operator-view-react";
import type { CartesianMapBlock } from "./public-card-data";
import { mapLegendPresentation } from "./map-legend";
import { layoutMapLabels } from "./map-label-layout";

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

function pointPresentation(category: string): {
  tone: "neutral" | "good" | "warn";
  hollow: boolean;
  radius: number;
} {
  if (category === "published")
    return { tone: "warn", hollow: false, radius: 3.1 };
  if (category === "skill") return { tone: "good", hollow: false, radius: 2.7 };
  if (category === "high-signal")
    return { tone: "neutral", hollow: true, radius: 2.2 };
  return { tone: "neutral", hollow: false, radius: 1.7 };
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
  const labels = layoutMapLabels(
    (layout?.territories ?? [])
      .filter((territory) => labeledZoneIds.has(territory.zone.id))
      .map(({ zone, center, radius }) => ({
        id: zone.id,
        label: zone.label,
        count: zone.memberIds.length,
        x: center.x,
        y: center.y - radius * 0.72 - 8,
      })),
    WIDTH,
    HEIGHT,
  );

  return (
    <OperatorSection
      id="knowledge"
      className="dashboard-tab-panel card-map-panel"
      data-dashboard-tab-panel
      data-card-map="knowledge"
      data-ui-panel="knowledge"
      role="tabpanel"
      aria-labelledby="dashboard-tab-knowledge"
    >
      <OperatorSectionHeading>Knowledge</OperatorSectionHeading>
      <OperatorPanel
        className="card map-card"
        heading="Knowledge map"
        source="public topics · semantic atlas"
        inset="tight"
      >
        <OperatorMapSummary
          className="knowledge-atlas-summary"
          aria-label="Knowledge map summary"
          metrics={[
            { label: "public entities held", value: entityTotal },
            { label: "mapped sources", value: block?.points.length ?? 0 },
            { label: "territories", value: block?.zones.length ?? 0 },
          ]}
          status={block !== undefined ? "Current" : "Waiting"}
          tone={block !== undefined ? "good" : "warn"}
        />
        <OperatorMapFrame
          className="knowledge-map-field map-field"
          layout="split"
          joined
          data-knowledge-atlas
        >
          {block && layout ? (
            <>
              <OperatorMapCanvas className="knowledge-map-canvas">
                <OperatorMapCoordinates start="Context ←" end="→ Practice" />
                <OperatorMapGraphic
                  presentation="tall"
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  aria-labelledby="knowledge-map-title knowledge-map-description"
                >
                  <title id="knowledge-map-title">{block.label}</title>
                  <desc id="knowledge-map-description">
                    {block.description}
                  </desc>
                  {layout.threads.map((thread, index) => (
                    <OperatorMapPath
                      presentation="trace"
                      emphasis={index < 3 ? "major" : undefined}
                      className="knowledge-weave"
                      key={thread.id}
                      d={`M ${thread.source.x} ${thread.source.y} Q ${(thread.source.x + thread.target.x) / 2 + thread.bend} ${(thread.source.y + thread.target.y) / 2 - thread.bend}, ${thread.target.x} ${thread.target.y}`}
                      pathLength={1}
                    />
                  ))}
                  {layout.territories.map((territory) => {
                    const { center, radius, rank, zone } = territory;
                    const isLeading = rank === 0;
                    const label = labels.get(zone.id);
                    return (
                      <OperatorMapGroup
                        className="knowledge-zone"
                        data-map-active={isLeading}
                        data-knowledge-zone={zone.id}
                        key={zone.id}
                      >
                        <OperatorMapPath
                          presentation="contour"
                          className="knowledge-zone-contour"
                          d={territoryPath(zone.id, center, radius)}
                        />
                        <OperatorMapPath
                          presentation="contour"
                          emphasis="middle"
                          className="knowledge-zone-contour"
                          d={territoryPath(
                            `${zone.id}:middle`,
                            center,
                            radius * 0.74,
                          )}
                        />
                        <OperatorMapPath
                          presentation="contour"
                          emphasis="inner"
                          className="knowledge-zone-contour"
                          d={territoryPath(
                            `${zone.id}:inner`,
                            center,
                            radius * 0.46,
                          )}
                        />
                        <OperatorMapCircle
                          presentation="anchor"
                          className="knowledge-zone-anchor"
                          cx={center.x}
                          cy={center.y}
                          r="3"
                        />
                        {label && (
                          <OperatorMapText
                            presentation="region"
                            className="knowledge-zone-label"
                            data-knowledge-label={zone.id}
                            data-label-truncated={label.text !== label.fullText}
                            aria-label={label.fullText}
                            x={label.x}
                            y={label.y}
                            textAnchor="middle"
                          >
                            <title>{label.fullText}</title>
                            {label.text}
                            <OperatorMapCount
                              className="knowledge-zone-count"
                              dx="6"
                            >
                              {zone.memberIds.length}
                            </OperatorMapCount>
                          </OperatorMapText>
                        )}
                      </OperatorMapGroup>
                    );
                  })}
                  {block.points.map((point) => {
                    const center = layout.pointPositions.get(point.id);
                    if (!center) return null;
                    const appearance = pointPresentation(point.category);
                    return (
                      <OperatorMapGroup
                        bloom
                        className="knowledge-point"
                        key={point.id}
                      >
                        <title>{`${point.label} · ${point.category}`}</title>
                        <OperatorMapCircle
                          presentation="point"
                          tone={appearance.tone}
                          hollow={appearance.hollow}
                          className="knowledge-point-mark"
                          cx={center.x}
                          cy={center.y}
                          r={appearance.radius}
                        />
                      </OperatorMapGroup>
                    );
                  })}
                  <g className="knowledge-map-axis" aria-hidden="true">
                    <OperatorMapText presentation="axis" x="20" y={HEIGHT - 18}>
                      Emergent
                    </OperatorMapText>
                    <OperatorMapText
                      presentation="axis"
                      x={WIDTH - 20}
                      y={HEIGHT - 18}
                      textAnchor="end"
                    >
                      Explicit
                    </OperatorMapText>
                  </g>
                </OperatorMapGraphic>
              </OperatorMapCanvas>
              <OperatorMapIndex
                className="knowledge-territory-index"
                heading="Territories"
                description="Largest public clusters, by source count."
                remainder={
                  sortedZones.length > indexedZones.length
                    ? `+ ${sortedZones.length - indexedZones.length} smaller territories`
                    : undefined
                }
                note="Hover or focus a territory to trace its contour. The map stays quiet until you ask for detail."
              >
                {indexedZones.map((zone, index) => (
                  <OperatorMapIndexItem
                    key={zone.id}
                    data-knowledge-zone-ref={zone.id}
                    aria-pressed={index === 0 ? "true" : "false"}
                    title={zone.label}
                    rank={String(index + 1).padStart(2, "0")}
                    label={zone.label}
                    count={zone.memberIds.length}
                  />
                ))}
              </OperatorMapIndex>
            </>
          ) : (
            <OperatorMapEmpty className="map-empty">
              The public knowledge map will grow as topics are indexed.
            </OperatorMapEmpty>
          )}
        </OperatorMapFrame>
        <OperatorMapLegend
          className="map-legend"
          aria-label="Knowledge map legend"
        >
          {(
            block?.legend ?? [
              { label: "Topic zones" },
              { label: "Published" },
              { label: "Skills" },
              { label: "Sources" },
            ]
          ).map((item) => (
            <OperatorMapLegendItem
              key={item.label}
              label={item.label}
              {...mapLegendPresentation(item)}
            />
          ))}
          <OperatorMapLegendNote className="map-live">
            {block?.points.length ?? 0} sources · {block?.zones.length ?? 0}{" "}
            territories · public scope
          </OperatorMapLegendNote>
        </OperatorMapLegend>
      </OperatorPanel>
    </OperatorSection>
  );
}
