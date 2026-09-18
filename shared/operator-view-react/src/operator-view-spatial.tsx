/** @jsxImportSource react */
import { spatialFrameStyles as spatial } from "./operator-spatial-frame.styles";
import { spatialContentStyles as spatialContent } from "./operator-spatial-content.styles";
import * as stylex from "@stylexjs/stylex";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import { type ReactElement } from "react";

type RuntimeSpatialBlock = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "spatial" }
>;

interface SpatialPosition {
  readonly x: number;
  readonly y: number;
}

function radialPosition(distance: number, bearing: number): SpatialPosition {
  const radians = ((bearing - 90) * Math.PI) / 180;
  const radius = distance * 45;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius,
  };
}

function spatialPositions(
  block: RuntimeSpatialBlock,
): ReadonlyMap<string, SpatialPosition> {
  const positions = new Map<string, SpatialPosition>();
  if (block.layout === "cartesian") {
    for (const point of block.points) {
      positions.set(point.id, { x: point.x * 100, y: point.y * 100 });
    }
    for (const zone of block.zones) {
      positions.set(zone.id, { x: zone.x * 100, y: zone.y * 100 });
    }
  } else {
    for (const point of block.points) {
      positions.set(point.id, radialPosition(point.distance, point.bearing));
    }
  }
  return positions;
}

export function SpatialBlock({
  block,
}: {
  block: RuntimeSpatialBlock;
}): ReactElement {
  const positions = spatialPositions(block);
  const frame = stylex.props(spatial.frame);
  return (
    <figure {...frame} data-ui-spatial aria-label={block.label}>
      <div {...stylex.props(spatial.canvas)}>
        <svg
          {...stylex.props(spatial.overlay)}
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {block.layout === "radial" &&
            block.strata.map((stratum) => (
              <ellipse
                key={stratum.id}
                {...stylex.props(spatial.boundary)}
                cx="500"
                cy="300"
                rx={stratum.maxDistance * 450}
                ry={stratum.maxDistance * 270}
              />
            ))}
          {block.layout === "cartesian" &&
            block.zones.map((zone) => (
              <circle
                key={zone.id}
                {...stylex.props(spatial.boundary, spatial.zone)}
                cx={zone.x * 1000}
                cy={zone.y * 600}
                r="72"
              />
            ))}
          {(block.relationships ?? []).map((relationship, index) => {
            const source = positions.get(relationship.sourceId);
            const target = positions.get(relationship.targetId);
            if (!source || !target) return null;
            return (
              <line
                key={`${relationship.sourceId}:${relationship.targetId}:${index}`}
                data-tone={relationship.tone ?? "neutral"}
                {...stylex.props(spatial.relationship)}
                x1={source.x * 10}
                y1={source.y * 6}
                x2={target.x * 10}
                y2={target.y * 6}
              />
            );
          })}
        </svg>
        {block.layout === "radial" && (
          <span {...stylex.props(spatial.center)} data-kind={block.centerKind}>
            {block.centerLabel}
          </span>
        )}
        <div {...stylex.props(spatial.overlay)} role="list">
          {block.points.map((point) => {
            const position = positions.get(point.id);
            if (!position) return null;
            const details =
              "category" in point
                ? [point.category, ...(point.details ?? [])]
                : [
                    point.kind,
                    point.status,
                    ...(point.tags ?? []),
                    ...(point.details ?? []),
                  ];
            return (
              <button
                key={point.id}
                {...stylex.props(spatialContent.point)}
                type="button"
                role="listitem"
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                data-ui-spatial-point={point.id}
                data-ui-spatial-related={JSON.stringify(
                  "relatedIds" in point ? (point.relatedIds ?? []) : [],
                )}
                data-tone={point.tone ?? "neutral"}
                aria-pressed="false"
                aria-controls={`${block.id}-detail-${point.id}`}
                title={`${point.label}: ${details.join(", ")}`}
              >
                <span
                  {...stylex.props(spatialContent.dot)}
                  aria-hidden="true"
                />
                <span {...stylex.props(spatialContent.pointLabel)}>
                  {point.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <figcaption>
        <p {...stylex.props(spatialContent.description)}>{block.description}</p>
        <ul {...stylex.props(spatialContent.legend)} aria-label="Legend">
          {block.legend.map((item, index) => (
            <li
              key={`${item.label}:${index}`}
              {...stylex.props(spatialContent.legendItem)}
              data-tone={item.tone ?? "neutral"}
            >
              {item.label}
            </li>
          ))}
        </ul>
        <div aria-live="polite">
          {block.points.map((point) => (
            <article
              key={point.id}
              id={`${block.id}-detail-${point.id}`}
              data-ui-spatial-detail={point.id}
              {...stylex.props(spatialContent.detail)}
              hidden
            >
              <strong {...stylex.props(spatialContent.detailTitle)}>
                {point.label}
              </strong>
              <span {...stylex.props(spatialContent.detailText)}>
                {"category" in point
                  ? point.category
                  : `${point.kind} · ${point.status}`}
              </span>
            </article>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
