/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { toneFill } from "@brains/app-ui-react";
import type { ReactElement } from "react";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import { seriesStyles as s } from "./operator-series.styles";

type SeriesBlock = Extract<RuntimeStudioOperatorPanelBlock, { type: "series" }>;
type SeriesPoint = SeriesBlock["points"][number];

/** Each point's column in viewBox units; the chart stretches to its panel. */
const COLUMN = 10;
const BAR = 8;
const HEIGHT = 100;
/** With nothing to plot the chart is a strip; slivers keep their size. */
const FLAT_HEIGHT = 10;
/** A zero still shows as a sliver, so it reads apart from a missing point. */
const MIN_BAR = 0.75;

function reading(point: SeriesPoint, unit: string | undefined): string {
  const value =
    point.value === null
      ? "no data"
      : `${point.value}${unit ? ` ${unit}` : ""}`;
  return `${point.label}: ${value}${point.marker ? ` · ${point.marker}` : ""}`;
}

export function SeriesBlock(props: { block: SeriesBlock }): ReactElement {
  const { label, unit, points } = props.block;
  const peak = Math.max(0, ...points.map((point) => point.value ?? 0));
  const first = points[0];
  const last = points[points.length - 1];
  const width = points.length * COLUMN;
  const flat = peak === 0;
  const chartHeight = flat ? FLAT_HEIGHT : HEIGHT;

  return (
    <figure {...stylex.props(s.figure)} data-series={props.block.id}>
      <figcaption {...stylex.props(s.caption)}>{label}</figcaption>
      <svg
        {...stylex.props(s.chart, flat && s.flat)}
        role="img"
        aria-label={`${label}: ${points.length} points, peak ${peak}${unit ? ` ${unit}` : ""}`}
        viewBox={`0 0 ${width} ${chartHeight}`}
        preserveAspectRatio="none"
      >
        {points.map((point, index) => {
          const x = index * COLUMN;
          const height =
            point.value === null || peak === 0
              ? MIN_BAR
              : Math.max(MIN_BAR, (point.value / peak) * chartHeight);
          return (
            <g
              key={point.id}
              data-series-point={point.id}
              data-missing={point.value === null ? "true" : undefined}
              data-tone={point.tone}
            >
              <title>{reading(point, unit)}</title>
              {point.marker && (
                <rect
                  {...stylex.props(s.marker)}
                  data-series-marker=""
                  x={x}
                  y={0}
                  width={COLUMN}
                  height={chartHeight}
                />
              )}
              <rect
                {...stylex.props(s.hit)}
                x={x}
                y={0}
                width={COLUMN}
                height={chartHeight}
              />
              {point.value === null ? (
                <rect
                  {...stylex.props(s.missing)}
                  x={x + (COLUMN - BAR) / 2}
                  y={chartHeight - 2}
                  width={BAR}
                  height={2}
                />
              ) : (
                <rect
                  {...stylex.props(s.bar, toneFill(point.tone))}
                  x={x + (COLUMN - BAR) / 2}
                  y={chartHeight - height}
                  width={BAR}
                  height={height}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div {...stylex.props(s.axis)} data-series-axis="">
        <span>{first?.label}</span>
        <span {...stylex.props(s.peak)}>
          {flat
            ? `no ${unit ?? "values"}`
            : `peak ${peak}${unit ? ` ${unit}` : ""}`}
        </span>
        <span>{last?.label}</span>
      </div>
    </figure>
  );
}
