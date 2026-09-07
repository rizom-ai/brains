/** @jsxImportSource react */
import type { JSX } from "react";
import {
  OperatorSection,
  OperatorSectionHeading,
  OperatorPanel,
  OperatorMapFrame,
  OperatorMapGraphic,
  OperatorMapEmpty,
  OperatorMapLegend,
  OperatorMapLegendItem,
  OperatorMapLegendNote,
  OperatorMapGroup,
  OperatorMapPath,
  OperatorMapCircle,
  OperatorMapText,
} from "@brains/operator-view-react";
import { type RadialMapBlock, widgetSourceData } from "./public-card-data";
import type { RenderableWidgetData } from "./types";
import { mapLegendPresentation } from "./map-legend";

const WIDTH = 980;
const HEIGHT = 560;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const MAX_RADIUS = 220;

interface PointPosition {
  x: number;
  y: number;
}

function radialPosition(distance: number, bearing: number): PointPosition {
  const angle = bearing * (Math.PI / 180);
  const radius = 56 + Math.max(0, Math.min(1, distance)) * (MAX_RADIUS - 56);
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y - Math.sin(angle) * radius,
  };
}

function nodePresentation(
  status: string,
  kind: string,
): {
  tone: "neutral" | "warn" | "secondary";
  dimmed: boolean;
  shape: "bulb" | "diamond" | "circle";
} {
  if (kind === "sighting")
    return { tone: "secondary", dimmed: false, shape: "diamond" };
  if (status === "approved")
    return { tone: "warn", dimmed: false, shape: "bulb" };
  if (status === "discovered")
    return { tone: "secondary", dimmed: false, shape: "circle" };
  return { tone: "neutral", dimmed: status === "archived", shape: "circle" };
}

export function ProximityMapPanel({
  block,
  widget,
}: {
  block: RadialMapBlock | undefined;
  widget?: RenderableWidgetData | undefined;
}): JSX.Element {
  if (!widget?.component) {
    return <DeclarativeProximityMapPanel block={block} />;
  }
  const RegisteredVisualization = widget.component;

  return (
    <OperatorSection
      id="network"
      className="dashboard-tab-panel card-map-panel"
      data-dashboard-tab-panel
      data-card-map="network"
      data-ui-panel="network"
      role="tabpanel"
      aria-labelledby="dashboard-tab-network"
    >
      <OperatorSectionHeading>Network</OperatorSectionHeading>
      <OperatorPanel
        className="card map-card"
        heading="Agent proximity"
        source="public directory · semantic distance"
        inset="tight"
      >
        <RegisteredVisualization data={widgetSourceData(widget.data)} />
      </OperatorPanel>
    </OperatorSection>
  );
}

function DeclarativeProximityMapPanel({
  block,
}: {
  block: RadialMapBlock | undefined;
}): JSX.Element {
  const positions = new Map<string, PointPosition>();
  for (const point of block?.points ?? []) {
    positions.set(point.id, radialPosition(point.distance, point.bearing));
  }
  const activeCount =
    block?.points.filter((point) => point.status !== "archived").length ?? 0;

  return (
    <OperatorSection
      id="network"
      className="dashboard-tab-panel card-map-panel"
      data-dashboard-tab-panel
      data-card-map="network"
      data-ui-panel="network"
      role="tabpanel"
      aria-labelledby="dashboard-tab-network"
    >
      <OperatorSectionHeading>Network</OperatorSectionHeading>
      <OperatorPanel
        className="card map-card"
        heading="Agent proximity"
        source="public directory · semantic distance"
        inset="tight"
      >
        <OperatorMapFrame className="proximity-map-field map-field" ambient>
          {block ? (
            <OperatorMapGraphic
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-labelledby="proximity-map-title proximity-map-description"
            >
              <title id="proximity-map-title">{block.label}</title>
              <desc id="proximity-map-description">{block.description}</desc>
              <defs>
                <radialGradient id="proximity-center-glow">
                  <stop
                    offset="0%"
                    stopColor="var(--console-accent)"
                    stopOpacity="0.35"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--console-accent)"
                    stopOpacity="0"
                  />
                </radialGradient>
                <filter
                  id="proximity-bulb-glow"
                  x="-100%"
                  y="-100%"
                  width="300%"
                  height="300%"
                >
                  <feGaussianBlur stdDeviation="4" />
                </filter>
              </defs>
              {Array.from({ length: 18 }, (_, index) => {
                const x = 60 + ((index * 137) % 850);
                const y = 44 + ((index * 89) % 470);
                return (
                  <OperatorMapCircle
                    presentation="spore"
                    className="proximity-spore"
                    key={`spore-${index}`}
                    cx={x}
                    cy={y}
                    r={index % 3 === 0 ? 1.2 : 0.8}
                  />
                );
              })}
              {[...block.strata]
                .sort((left, right) => right.maxDistance - left.maxDistance)
                .map((stratum) => {
                  const radius =
                    56 +
                    Math.max(0, Math.min(1, stratum.maxDistance)) *
                      (MAX_RADIUS - 56);
                  return (
                    <g className="proximity-stratum" key={stratum.id}>
                      <OperatorMapCircle
                        presentation="distance"
                        cx={CENTER_X}
                        cy={CENTER_Y}
                        r={radius}
                      />
                      <OperatorMapText
                        presentation="distance"
                        x={CENTER_X + radius + 6}
                        y={CENTER_Y + 3}
                      >
                        {stratum.label}
                      </OperatorMapText>
                    </g>
                  );
                })}
              {(block.clusters ?? []).map((cluster) => {
                const members = cluster.memberIds
                  .map((id) => positions.get(id))
                  .filter((member) => member !== undefined);
                if (members.length < 2) return null;
                const x =
                  members.reduce((total, member) => total + member.x, 0) /
                  members.length;
                const y =
                  members.reduce((total, member) => total + member.y, 0) /
                  members.length;
                const radius =
                  Math.max(
                    ...members.map((member) =>
                      Math.hypot(member.x - x, member.y - y),
                    ),
                  ) + 27;
                return (
                  <g className="proximity-cluster" key={cluster.id}>
                    <OperatorMapCircle
                      presentation="region"
                      cx={x}
                      cy={y}
                      r={radius}
                    />
                    <OperatorMapText
                      presentation="group"
                      x={x}
                      y={y - radius - 8}
                      textAnchor="middle"
                    >
                      {cluster.label}
                    </OperatorMapText>
                  </g>
                );
              })}
              {(block.relationships ?? []).map((relationship) => {
                const source = positions.get(relationship.sourceId);
                const target = positions.get(relationship.targetId);
                if (!source || !target) return null;
                return (
                  <OperatorMapPath
                    presentation="connector"
                    className="proximity-thread"
                    key={`${relationship.sourceId}:${relationship.targetId}`}
                    d={`M ${source.x} ${source.y} Q ${CENTER_X} ${CENTER_Y}, ${target.x} ${target.y}`}
                  />
                );
              })}
              <g className="proximity-center">
                <OperatorMapCircle
                  presentation="halo"
                  className="proximity-center-halo"
                  cx={CENTER_X}
                  cy={CENTER_Y}
                  r="48"
                  fill="url(#proximity-center-glow)"
                />
                <OperatorMapCircle
                  presentation="identity"
                  className="proximity-center-core"
                  cx={CENTER_X}
                  cy={CENTER_Y}
                  r="8"
                />
                <OperatorMapText
                  presentation="identity"
                  x={CENTER_X}
                  y={CENTER_Y + 30}
                  textAnchor="middle"
                >
                  {block.centerLabel}
                </OperatorMapText>
              </g>
              {block.points.map((point) => {
                const location = positions.get(point.id);
                if (!location) return null;
                const appearance = nodePresentation(point.status, point.kind);
                return (
                  <OperatorMapGroup
                    dimmed={appearance.dimmed}
                    className="proximity-node"
                    data-proximity-status={point.status}
                    key={point.id}
                  >
                    <title>{`${point.label} · ${point.status}${point.tags?.length ? ` · ${point.tags.join(", ")}` : ""}`}</title>
                    {appearance.shape === "bulb" ? (
                      <>
                        <OperatorMapCircle
                          presentation="glow"
                          className="proximity-node-glow"
                          cx={location.x}
                          cy={location.y}
                          r="15"
                          filter="url(#proximity-bulb-glow)"
                        />
                        <OperatorMapPath
                          presentation="stem"
                          className="proximity-node-stem"
                          d={`M ${location.x} ${location.y + 5} Q ${location.x - 7} ${location.y + 15}, ${location.x - 1} ${location.y + 23}`}
                        />
                        <OperatorMapCircle
                          presentation="node"
                          tone={appearance.tone}
                          className="proximity-node-mark"
                          cx={location.x}
                          cy={location.y}
                          r="5.5"
                        />
                      </>
                    ) : appearance.shape === "diamond" ? (
                      <OperatorMapPath
                        presentation="node"
                        tone={appearance.tone}
                        className="proximity-node-mark"
                        d={`M ${location.x} ${location.y - 5} L ${location.x + 5} ${location.y} L ${location.x} ${location.y + 5} L ${location.x - 5} ${location.y} Z`}
                      />
                    ) : (
                      <OperatorMapCircle
                        presentation="node"
                        tone={appearance.tone}
                        className="proximity-node-mark"
                        cx={location.x}
                        cy={location.y}
                        r="4.5"
                      />
                    )}
                    <OperatorMapText
                      presentation="node"
                      x={location.x + 10}
                      y={location.y - 8}
                    >
                      {point.label}
                    </OperatorMapText>
                  </OperatorMapGroup>
                );
              })}
            </OperatorMapGraphic>
          ) : (
            <OperatorMapEmpty className="map-empty">
              The public agent network will appear as approved peers are
              indexed.
            </OperatorMapEmpty>
          )}
        </OperatorMapFrame>
        <OperatorMapLegend
          className="map-legend"
          aria-label="Agent proximity legend"
        >
          {(
            block?.legend ?? [
              { label: "Approved", tone: "good" },
              { label: "Discovered", tone: "warn" },
            ]
          ).map((item) => (
            <OperatorMapLegendItem
              key={item.label}
              label={item.label}
              {...mapLegendPresentation(item)}
            />
          ))}
          <OperatorMapLegendNote className="map-live">
            {activeCount} {activeCount === 1 ? "agent" : "agents"} ·{" "}
            {block?.clusters?.length ?? 0}{" "}
            {block?.clusters?.length === 1 ? "constellation" : "constellations"}
            {" discovered · federation open"}
          </OperatorMapLegendNote>
        </OperatorMapLegend>
      </OperatorPanel>
    </OperatorSection>
  );
}
