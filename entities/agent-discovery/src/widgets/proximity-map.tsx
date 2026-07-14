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
// The map owns the full card width; the brain sits just right of center so
// the count HUD (top-left) and the organism balance asymmetrically.
const CENTER_X = 520;
const CENTER_Y = 260;
const MAX_RADIUS = 220;
// The site surface crops to the disc, following the center.
const SITE_VIEWBOX = `${CENTER_X - 340} 0 680 ${HEIGHT}`;

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
  blurRef,
}: {
  node: ProximityMapNode;
  point: Point;
  blurRef: string;
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
          filter={blurRef}
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

/** Labels crowd past this many active nodes; dense mode shows them on hover. */
const LABEL_BUDGET = 28;
const MAX_PULSES = 6;
/** The brain breathes light outward; bulbs shimmer as the wavefront crosses
 * their radius, so the arrival order IS the proximity order. */
const RIPPLE_PERIOD_S = 8;
const RIPPLE_R_START = 14;
const RIPPLE_R_END = 232;

function rippleShimmerStyle(radius: number): string {
  const arrival =
    (RIPPLE_PERIOD_S * (radius - RIPPLE_R_START)) /
    (RIPPLE_R_END - RIPPLE_R_START);
  return `animation:proximityRippleShimmer ${RIPPLE_PERIOD_S}s linear infinite;animation-delay:${arrival.toFixed(2)}s`;
}

export function ProximityMap({
  data,
  surface = "dashboard",
}: {
  data: ProximityMapData;
  surface?: "dashboard" | "site";
}): JSX.Element {
  if (data.nodes.length === 0) return <EmptyProximityMap data={data} />;

  // Defs and thread ids are namespaced per surface so two maps on one page
  // never share (or theme-leak through) each other's filters and gradients.
  const blurId = `proximity-blur-${surface}`;
  const mistId = `proximity-mist-${surface}`;
  const blurRef = `url(#${blurId})`;

  const maxNodeDistance = Math.max(
    ...data.nodes.map((node) => node.distance),
    ...data.sightings.map((sighting) => sighting.distance),
  );
  const maxDistance = Math.max(data.distanceRange.max, maxNodeDistance, 0.1);
  const strata = strataForDistanceRange(maxDistance);
  const layouts = buildNodeLayouts(data.nodes, maxDistance);
  const positions = new Map(layouts.map(({ node, point }) => [node.id, point]));
  const nodeNamesById = new Map(data.nodes.map((node) => [node.id, node.name]));
  const clusterIdByNode = new Map<string, string>();
  data.clusters.forEach((cluster, index) => {
    for (const memberId of cluster.memberIds)
      clusterIdByNode.set(memberId, `cluster-${index}`);
  });
  const weaveRandom = mulberry32(7331);
  const sightingRandom = mulberry32(4242);
  const activeNodes = data.nodes.filter((node) => node.status !== "archived");
  // Render only sightings whose introducers are actually on this map —
  // a thread has to grow from somewhere.
  const sightingLayouts = data.sightings.flatMap((sighting) => {
    const viaPoints = sighting.viaIds.flatMap((viaId) => {
      const from = positions.get(viaId);
      return from ? [{ viaId, from }] : [];
    });
    if (viaPoints.length === 0) return [];
    return [
      {
        sighting,
        point: polar(sighting.distance, sighting.bearing, maxDistance),
        viaPoints,
      },
    ];
  });
  const pulseLayouts = layouts
    .filter(({ node }) => node.status === "approved")
    .slice(0, MAX_PULSES);
  const dense = activeNodes.length > LABEL_BUDGET;

  return (
    <div
      class={`proximity-field proximity-field--${surface}${dense ? " proximity-field--dense" : ""}`}
      data-proximity-map
    >
      <svg
        viewBox={surface === "site" ? SITE_VIEWBOX : `0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Semantic proximity of saved agents to this brain"
      >
        <defs>
          <filter id={blurId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <radialGradient id={mistId}>
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
              tabIndex={0}
            >
              <circle
                class="proximity-cluster-mist"
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.radius}
                fill={`url(#${mistId})`}
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
                      filter={blurRef}
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
                id={
                  node.status === "approved"
                    ? `proximity-thread-${surface}-${node.id}`
                    : undefined
                }
                d={path}
                fill="none"
                stroke={stroke}
                strokeOpacity={archived ? 0.012 : pending ? 0.08 : 0.14}
                strokeWidth="3.4"
                filter={archived ? undefined : blurRef}
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

        {/* nutrient pulses — energy transfer along established connections */}
        {pulseLayouts.map(({ node }, index) => (
          <g
            key={`pulse:${node.id}`}
            class="proximity-pulse"
            aria-hidden="true"
          >
            <circle r="3.2" fill="var(--console-accent)" opacity="0.3">
              <animateMotion
                dur={`${5 + (index % 3) * 1.6}s`}
                begin={`${index * 1.9}s`}
                repeatCount="indefinite"
              >
                <mpath href={`#proximity-thread-${surface}-${node.id}`} />
              </animateMotion>
            </circle>
            <circle r="1.3" fill="var(--console-text)" opacity="0.9">
              <animateMotion
                dur={`${5 + (index % 3) * 1.6}s`}
                begin={`${index * 1.9}s`}
                repeatCount="indefinite"
              >
                <mpath href={`#proximity-thread-${surface}-${node.id}`} />
              </animateMotion>
            </circle>
          </g>
        ))}

        {/* outward ripple — a soft blurred pass under a thin bright edge */}
        <g class="proximity-ripple" aria-hidden="true">
          {[
            { width: 5, opacity: "0.1;0.07;0", blurred: true },
            { width: 1.1, opacity: "0.38;0.22;0", blurred: false },
          ].map((pass) => (
            <circle
              key={pass.width}
              cx={CENTER_X}
              cy={CENTER_Y}
              fill="none"
              stroke="var(--console-accent)"
              strokeWidth={pass.width}
              filter={pass.blurred ? blurRef : undefined}
            >
              <animate
                attributeName="r"
                values={`${RIPPLE_R_START};${RIPPLE_R_END}`}
                dur={`${RIPPLE_PERIOD_S}s`}
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.2 0 0.4 1"
              />
              <animate
                attributeName="stroke-opacity"
                values={pass.opacity}
                keyTimes="0;0.6;1"
                dur={`${RIPPLE_PERIOD_S}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>

        <g data-proximity-center={data.center.kind}>
          <circle
            class="proximity-center-halo"
            cx={CENTER_X}
            cy={CENTER_Y}
            r="26"
            fill="var(--console-accent)"
            opacity="0.1"
            filter={blurRef}
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r="11"
            fill="var(--console-accent)"
            opacity="0.28"
            filter={blurRef}
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
          const shimmer =
            node.status === "archived"
              ? undefined
              : rippleShimmerStyle(
                  radiusForDistance(node.distance, maxDistance),
                );
          return (
            <g
              class="proximity-agent"
              key={node.id}
              style={shimmer}
              data-proximity-node={node.id}
              data-proximity-node-cluster={clusterId}
              data-proximity-name={node.name}
              data-proximity-kind={node.kind}
              data-proximity-status={node.status}
              data-proximity-distance={node.distance.toFixed(2)}
              data-proximity-tags={node.tags.join(", ")}
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
                  filter={blurRef}
                />
              )}
              <Bulb node={node} point={point} blurRef={blurRef} />
              {Math.abs(labelY - point.y) > 7 && (
                <path
                  class="proximity-label-leader"
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

        {/* second-order sightings — hearsay at half light. Threads grow from
            the introducing peers' roots, never from the center: reachable
            through someone, not directly. */}
        {sightingLayouts.map(({ sighting, point, viaPoints }) => {
          const viaNames = sighting.viaIds
            .map((viaId) => nodeNamesById.get(viaId) ?? viaId)
            .join(" · ");
          const onRight = point.x >= CENTER_X;
          return (
            <g
              class="proximity-sighting"
              key={`sighting:${sighting.id}`}
              data-proximity-sighting={sighting.id}
              data-proximity-name={sighting.name}
              data-proximity-via={viaNames}
              data-proximity-via-ids={sighting.viaIds.join(" ")}
              data-proximity-distance={sighting.distance.toFixed(2)}
              data-proximity-tags={sighting.tags.join(", ")}
              tabIndex={0}
            >
              <title>{`${sighting.name} · second order · via ${viaNames} · distance ${sighting.distance.toFixed(2)}`}</title>
              {viaPoints.map(({ viaId, from }) => {
                const dx = point.x - from.x;
                const dy = point.y - from.y;
                const length = Math.max(1, Math.hypot(dx, dy));
                const bow = (sightingRandom() - 0.5) * length * 0.5;
                const middle = {
                  x: from.x + dx * 0.5 + (-dy / length) * bow,
                  y: from.y + dy * 0.5 + (dx / length) * bow,
                };
                const d = `M ${from.x} ${from.y} Q ${middle.x} ${middle.y}, ${point.x} ${point.y}`;
                return (
                  <g class="proximity-sighting-thread" key={viaId}>
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--console-accent)"
                      strokeOpacity="0.09"
                      strokeWidth="2.4"
                      filter={blurRef}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--console-accent)"
                      strokeOpacity="0.2"
                      strokeWidth="0.8"
                    />
                  </g>
                );
              })}
              <circle
                cx={point.x}
                cy={point.y}
                r="7.8"
                fill="var(--console-accent)"
                opacity="0.07"
                filter={blurRef}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                fill="var(--console-accent)"
                opacity="0.5"
              />
              <text
                class="proximity-node-label"
                fill-opacity="0.55"
                x={point.x + (onRight ? 11 : -11)}
                y={point.y + 3}
                textAnchor={onRight ? "start" : "end"}
              >
                {sighting.name.toLowerCase()}
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

      {surface === "dashboard" && (
        <>
          <div class="proximity-hud proximity-hud-count" aria-hidden="true">
            <div class="proximity-count-number">{activeNodes.length}</div>
            <div class="proximity-count-label">agents in reach</div>
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
        </>
      )}

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
