/** @jsxImportSource preact */
import type { WidgetComponentProps } from "@brains/dashboard";
import type { JSX } from "preact";
import {
  proximityMapDataSchema,
  type ProximityMapCluster,
  type ProximityMapData,
  type ProximityMapNode,
} from "../lib/proximity-map-schema";
export { proximityMapScript } from "./proximity-map-script";

const WIDTH = 1000;
const HEIGHT = 520;
const CENTER_X = 360;
const CENTER_Y = 260;
const MAX_RADIUS = 220;

interface Point {
  x: number;
  y: number;
}

interface NodeLayout {
  node: ProximityMapNode;
  point: Point;
  path: string;
  rootlet: string;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "end";
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return (): number => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function radiusForDistance(distance: number, maxDistance: number): number {
  return Math.min(1, Math.max(0, distance / maxDistance)) * MAX_RADIUS;
}

function strataForDistanceRange(maxDistance: number): number[] {
  const interval = maxDistance <= 0.4 ? 0.1 : maxDistance <= 1 ? 0.2 : 0.5;
  const strata: number[] = [];
  for (let distance = interval; distance < maxDistance; distance += interval) {
    strata.push(Number(distance.toFixed(2)));
  }
  return strata;
}

function polar(distance: number, bearing: number, maxDistance: number): Point {
  const radians = (bearing * Math.PI) / 180;
  const radius = radiusForDistance(distance, maxDistance);
  return {
    x: CENTER_X + Math.cos(radians) * radius,
    y: CENTER_Y - Math.sin(radians) * radius,
  };
}

function curveForNode(
  point: Point,
  random: () => number,
): {
  path: string;
  rootlet: string;
} {
  const dx = point.x - CENTER_X;
  const dy = point.y - CENTER_Y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const firstBow = (random() - 0.5) * length * 0.42;
  const secondBow = (random() - 0.5) * length * 0.3;
  const first = {
    x: CENTER_X + dx * 0.34 + perpendicularX * firstBow,
    y: CENTER_Y + dy * 0.34 + perpendicularY * firstBow,
  };
  const second = {
    x: CENTER_X + dx * 0.7 + perpendicularX * secondBow,
    y: CENTER_Y + dy * 0.7 + perpendicularY * secondBow,
  };

  const forkAt = 0.46 + random() * 0.22;
  const forkStart = {
    x: CENTER_X + dx * forkAt,
    y: CENTER_Y + dy * forkAt,
  };
  const forkAngle = Math.atan2(dy, dx) + (random() - 0.5) * 2.1;
  const forkLength = 14 + random() * 22;
  const forkEnd = {
    x: forkStart.x + Math.cos(forkAngle) * forkLength,
    y: forkStart.y + Math.sin(forkAngle) * forkLength,
  };

  return {
    path: `M ${CENTER_X} ${CENTER_Y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${point.x} ${point.y}`,
    rootlet: `M ${forkStart.x} ${forkStart.y} Q ${(forkStart.x + forkEnd.x) / 2 + (random() - 0.5) * 8} ${(forkStart.y + forkEnd.y) / 2 + (random() - 0.5) * 8}, ${forkEnd.x} ${forkEnd.y}`,
  };
}

function spreadLabels(
  entries: Array<{ id: string; preferredY: number }>,
): Map<string, number> {
  const sorted = entries.slice().sort((left, right) => {
    const difference = left.preferredY - right.preferredY;
    return difference !== 0 ? difference : left.id.localeCompare(right.id);
  });
  const minimumY = 56;
  const maximumY = HEIGHT - 58;
  const gap = 15;
  const positions: number[] = [];

  for (const entry of sorted) {
    positions.push(
      Math.max(
        entry.preferredY,
        (positions[positions.length - 1] ?? -Infinity) + gap,
      ),
    );
  }
  const overflow = Math.max(
    0,
    (positions[positions.length - 1] ?? 0) - maximumY,
  );
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = (positions[index] ?? 0) - overflow;
  }
  for (let index = positions.length - 2; index >= 0; index -= 1) {
    positions[index] = Math.min(
      positions[index] ?? 0,
      (positions[index + 1] ?? maximumY) - gap,
    );
  }
  const underflow = Math.max(0, minimumY - (positions[0] ?? minimumY));

  return new Map(
    sorted.map((entry, index) => [
      entry.id,
      (positions[index] ?? 0) + underflow,
    ]),
  );
}

function buildNodeLayouts(
  nodes: ProximityMapNode[],
  maxDistance: number,
): NodeLayout[] {
  const random = mulberry32(133);
  const positioned = nodes.map((node) => ({
    node,
    point: polar(node.distance, node.bearing, maxDistance),
  }));
  const leftLabels = spreadLabels(
    positioned
      .filter(({ point }) => point.x < CENTER_X)
      .map(({ node, point }) => ({ id: node.id, preferredY: point.y + 3 })),
  );
  const rightLabels = spreadLabels(
    positioned
      .filter(({ point }) => point.x >= CENTER_X)
      .map(({ node, point }) => ({ id: node.id, preferredY: point.y + 3 })),
  );

  return positioned.map(({ node, point }) => {
    const curves = curveForNode(point, random);
    const onRight = point.x >= CENTER_X;
    return {
      node,
      point,
      ...curves,
      labelX: point.x + (onRight ? 12 : -12),
      labelY: (onRight ? rightLabels : leftLabels).get(node.id) ?? point.y + 3,
      labelAnchor: onRight ? "start" : "end",
    };
  });
}

function clusterGeometry(
  cluster: ProximityMapCluster,
  positions: Map<string, Point>,
): { center: Point; radius: number } | null {
  const points = cluster.memberIds.flatMap((id) => {
    const point = positions.get(id);
    return point ? [point] : [];
  });
  if (points.length < 2) return null;

  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const radius =
    Math.max(
      ...points.map((point) =>
        Math.hypot(point.x - center.x, point.y - center.y),
      ),
    ) + 26;
  return { center, radius };
}

function weavePath(first: Point, second: Point, random: () => number): string {
  const middleX = (first.x + second.x) / 2 + (random() - 0.5) * 34;
  const middleY = (first.y + second.y) / 2 + (random() - 0.5) * 34;
  return `M ${first.x} ${first.y} Q ${middleX} ${middleY}, ${second.x} ${second.y}`;
}

function Bulb({
  node,
  point,
}: {
  node: ProximityMapNode;
  point: Point;
}): JSX.Element {
  const archived = node.status === "archived";
  const pending = node.status === "discovered";

  if (archived) {
    return (
      <circle
        class="proximity-archived-remnant"
        cx={point.x}
        cy={point.y}
        r="1.4"
        fill="var(--console-text-faint)"
        opacity="0.18"
      />
    );
  }

  const bulb = (
    x: number,
    y: number,
    radius: number,
    key: string,
  ): JSX.Element =>
    pending ? (
      <circle
        key={key}
        cx={x}
        cy={y}
        r={radius + 0.8}
        fill="none"
        stroke="var(--console-warn)"
        strokeWidth="1.1"
        strokeDasharray="2.4 2"
      />
    ) : (
      <g key={key}>
        <circle
          class="proximity-bulb-glow"
          cx={x}
          cy={y}
          r={radius * 3.2}
          fill="var(--console-accent)"
          opacity="0.13"
          filter="url(#proximity-blur)"
        />
        <circle cx={x} cy={y} r={radius} fill="var(--console-accent)" />
        <circle
          cx={x}
          cy={y}
          r={radius * 0.42}
          fill="var(--console-text)"
          opacity="0.9"
        />
      </g>
    );

  if (node.kind === "professional") {
    return bulb(point.x, point.y, 3.4, "professional");
  }

  const angles =
    node.kind === "team" ? [90, 210, 330] : [18, 90, 162, 234, 306];
  const orbit = node.kind === "team" ? 4.6 : 6.4;
  const radius = node.kind === "team" ? 2.1 : 1.7;
  return (
    <g>
      {angles.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return bulb(
          point.x + Math.cos(radians) * orbit,
          point.y - Math.sin(radians) * orbit,
          radius,
          String(angle),
        );
      })}
    </g>
  );
}

function EmptyProximityMap({ data }: { data: ProximityMapData }): JSX.Element {
  return (
    <div class="proximity-empty" data-proximity-map-empty>
      <p class="muted">No indexed agents yet.</p>
      {data.center.kind === "centroid" && (
        <p class="muted">Identity not indexed yet — waiting for embeddings.</p>
      )}
      {data.pendingCount > 0 && (
        <p class="muted">{data.pendingCount} pending indexing</p>
      )}
    </div>
  );
}

export function ProximityMap({
  data,
}: {
  data: ProximityMapData;
}): JSX.Element {
  if (data.nodes.length === 0) return <EmptyProximityMap data={data} />;

  const maxNodeDistance = Math.max(...data.nodes.map((node) => node.distance));
  const maxDistance = Math.max(data.distanceRange.max, maxNodeDistance, 0.1);
  const strata = strataForDistanceRange(maxDistance);
  const layouts = buildNodeLayouts(data.nodes, maxDistance);
  const positions = new Map(layouts.map(({ node, point }) => [node.id, point]));
  const clusterIdByNode = new Map<string, string>();
  data.clusters.forEach((cluster, index) => {
    for (const memberId of cluster.memberIds)
      clusterIdByNode.set(memberId, `cluster-${index}`);
  });
  const weaveRandom = mulberry32(7331);
  const activeNodes = data.nodes.filter((node) => node.status !== "archived");
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));

  return (
    <div class="proximity-field" data-proximity-map>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Semantic proximity of saved agents to this brain"
      >
        <defs>
          <filter
            id="proximity-blur"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <radialGradient id="proximity-mist">
            <stop
              offset="0%"
              stop-color="var(--console-secondary)"
              stop-opacity="0.3"
            />
            <stop
              offset="70%"
              stop-color="var(--console-secondary)"
              stop-opacity="0.11"
            />
            <stop
              offset="100%"
              stop-color="var(--console-secondary)"
              stop-opacity="0"
            />
          </radialGradient>
        </defs>

        {strata.map((distance) => (
          <g key={distance} data-proximity-ring={String(distance)}>
            <circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={radiusForDistance(distance, maxDistance)}
              fill="none"
              stroke="var(--console-rule)"
              strokeWidth="1"
            />
            <text
              class="proximity-strata-label"
              x={CENTER_X + 4}
              y={CENTER_Y - radiusForDistance(distance, maxDistance) - 5}
            >
              {distance.toFixed(1)}
            </text>
          </g>
        ))}

        {data.clusters.map((cluster, clusterIndex) => {
          const geometry = clusterGeometry(cluster, positions);
          if (!geometry) return null;
          const paths = cluster.links.flatMap((link) => {
            const firstPoint = positions.get(link.sourceId);
            const secondPoint = positions.get(link.targetId);
            return firstPoint && secondPoint
              ? [weavePath(firstPoint, secondPoint, weaveRandom)]
              : [];
          });
          const labelAbove = geometry.center.y < CENTER_Y;
          return (
            <g
              key={cluster.label}
              data-proximity-cluster={cluster.label}
              data-proximity-cluster-id={`cluster-${clusterIndex}`}
              data-proximity-cluster-label={cluster.label}
              data-proximity-cluster-members={cluster.memberIds.length}
              role="button"
              tabIndex={0}
            >
              <circle
                class="proximity-cluster-mist"
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.radius}
                fill="url(#proximity-mist)"
              />
              <g class="proximity-cluster-weave">
                {paths.map((path, index) => (
                  <g key={index}>
                    <path
                      d={path}
                      fill="none"
                      stroke="var(--console-secondary)"
                      strokeOpacity="0.22"
                      strokeWidth="2.6"
                      filter="url(#proximity-blur)"
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke="var(--console-secondary)"
                      strokeOpacity="0.5"
                      strokeWidth="0.9"
                    />
                  </g>
                ))}
              </g>
              <text
                class="proximity-cluster-label"
                x={geometry.center.x}
                y={Math.max(
                  24,
                  Math.min(
                    HEIGHT - 24,
                    labelAbove
                      ? geometry.center.y - geometry.radius - 10
                      : geometry.center.y + geometry.radius + 20,
                  ),
                )}
                textAnchor="middle"
              >
                {cluster.label}
              </text>
            </g>
          );
        })}

        {layouts.map(({ node, path, rootlet }) => {
          const archived = node.status === "archived";
          const pending = node.status === "discovered";
          const stroke = archived
            ? "var(--console-text-faint)"
            : "var(--console-accent)";
          return (
            <g key={`thread:${node.id}`}>
              <path
                d={path}
                fill="none"
                stroke={stroke}
                strokeOpacity={archived ? 0.012 : pending ? 0.08 : 0.14}
                strokeWidth="3.4"
                filter={archived ? undefined : "url(#proximity-blur)"}
              />
              <path
                d={path}
                fill="none"
                stroke={stroke}
                strokeOpacity={archived ? 0.045 : pending ? 0.16 : 0.3}
                strokeWidth={archived ? 0.65 : 1}
                strokeDasharray={archived ? "1 8" : pending ? "3 5" : undefined}
                strokeLinecap="round"
              />
              <path
                d={rootlet}
                fill="none"
                stroke={stroke}
                strokeOpacity={archived ? 0.012 : pending ? 0.06 : 0.12}
                strokeWidth="0.6"
              />
            </g>
          );
        })}

        <g data-proximity-center={data.center.kind}>
          <circle
            class="proximity-center-halo"
            cx={CENTER_X}
            cy={CENTER_Y}
            r="26"
            fill="var(--console-accent)"
            opacity="0.1"
            filter="url(#proximity-blur)"
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="11"
            fill="var(--console-accent)"
            opacity="0.28"
            filter="url(#proximity-blur)"
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="4.6"
            fill="var(--console-accent)"
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="2"
            fill="var(--console-text)"
          />
          <text class="proximity-you-label" x={CENTER_X} y={CENTER_Y + 30}>
            you
          </text>
        </g>

        {layouts.map(({ node, point, labelX, labelY, labelAnchor }) => {
          const clusterId = clusterIdByNode.get(node.id);
          return (
            <g
              class="proximity-agent"
              key={node.id}
              data-proximity-node={node.id}
              data-proximity-node-cluster={clusterId}
              data-proximity-name={node.name}
              data-proximity-kind={node.kind}
              data-proximity-status={node.status}
              data-proximity-distance={node.distance.toFixed(2)}
              data-proximity-tags={node.tags.join(", ")}
              role="button"
              tabIndex={0}
            >
              <title>{`${node.name} · distance ${node.distance.toFixed(2)}${node.status === "discovered" ? " · pending review" : node.status === "archived" ? " · archived" : ""}`}</title>
              {clusterId && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="15"
                  fill="var(--console-secondary)"
                  opacity="0.2"
                  filter="url(#proximity-blur)"
                />
              )}
              <Bulb node={node} point={point} />
              {Math.abs(labelY - point.y) > 7 && (
                <path
                  d={`M ${point.x + (labelAnchor === "start" ? 6 : -6)} ${point.y} L ${labelX + (labelAnchor === "start" ? -3 : 3)} ${labelY - 3}`}
                  fill="none"
                  stroke="var(--console-rule-strong)"
                  strokeWidth="0.7"
                />
              )}
              <text
                class="proximity-node-label"
                x={labelX}
                y={labelY}
                textAnchor={labelAnchor}
              >
                {node.name.toLowerCase()}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 9 }, (_, index) => {
          const random = mulberry32(900 + index);
          return (
            <circle
              key={index}
              class="proximity-spore"
              cx={46 + random() * (WIDTH - 92)}
              cy={42 + random() * (HEIGHT - 84)}
              r={0.7 + random() * 0.9}
              fill={
                random() < 0.6
                  ? "var(--console-secondary)"
                  : "var(--console-accent)"
              }
              opacity="0.26"
              style={`animation-delay:-${(random() * 11).toFixed(1)}s`}
            />
          );
        })}
      </svg>

      <div class="proximity-hud proximity-hud-count" aria-hidden="true">
        <div class="proximity-count-number">{activeNodes.length}</div>
        <div class="proximity-count-label">agents in reach</div>
      </div>

      <div
        class="proximity-hud proximity-hud-chart"
        aria-label="Semantic constellations"
      >
        <div class="proximity-hud-title">Constellations</div>
        {data.clusters.length > 0 ? (
          data.clusters.map((cluster, index) => (
            <div
              class="proximity-constellation-row"
              key={`${cluster.label}:${index}`}
              data-proximity-constellation={`cluster-${index}`}
              data-proximity-cluster-label={cluster.label}
              data-proximity-cluster-members={cluster.memberIds.length}
              role="button"
              tabIndex={0}
            >
              <span>
                <span class="proximity-constellation-name">
                  {cluster.label}
                </span>
                <span class="proximity-constellation-members">
                  {cluster.memberIds
                    .flatMap((id) => {
                      const node = nodesById.get(id);
                      return node ? [node.name] : [];
                    })
                    .join(" · ")}
                </span>
              </span>
              <span class="proximity-constellation-count">
                {cluster.memberIds.length} agents
              </span>
            </div>
          ))
        ) : (
          <p class="proximity-constellation-empty">No constellations yet</p>
        )}
      </div>

      <div class="proximity-hud proximity-hud-foot">
        <div class="proximity-legend" aria-label="Agent kinds">
          <span>● professional</span>
          <span>∴ team</span>
          <span>◌ collective</span>
          <span>· archived trace</span>
        </div>
        {data.pendingCount > 0 && (
          <p class="proximity-pending-note">
            <b>{data.pendingCount}</b> pending indexing
          </p>
        )}
        {data.center.kind === "centroid" && (
          <p class="proximity-pending-note">
            <b>Identity not indexed</b> · centroid fallback
          </p>
        )}
      </div>

      <div class="proximity-tooltip" data-proximity-tooltip hidden />
    </div>
  );
}

export function AgentProximityWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = proximityMapDataSchema.safeParse(data);
  if (!parsed.success) return <p class="muted">Nothing to show yet.</p>;
  return <ProximityMap data={parsed.data} />;
}
