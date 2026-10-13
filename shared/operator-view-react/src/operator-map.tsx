/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { mapStyles as s } from "./operator-map.styles";
import { styledProps } from "./styled-props";

/** Hosts supply the visualization, supporting content, and all data interpretation. */
export function OperatorMapFrame(
  props: ComponentProps<"div"> & {
    layout?: "split";
    joined?: boolean;
    ambient?: boolean;
  },
): ReactElement {
  const { layout, joined, ambient, ...attributes } = props;
  return (
    <div
      {...styledProps(
        attributes,
        s.frame,
        layout === "split" && s.split,
        joined && s.joined,
        ambient && s.ambient,
      )}
    />
  );
}

export function OperatorMapCanvas(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.canvas)} />;
}

/** Decorative coordinate labels; meaningful axes also belong in the SVG description. */
export function OperatorMapCoordinates(props: {
  start: string;
  end: string;
}): ReactElement {
  return (
    <div {...stylex.props(s.coordinates)} aria-hidden="true">
      <span>{props.start}</span>
      <span>{props.end}</span>
    </div>
  );
}

export function OperatorMapGraphic(
  props: ComponentProps<"svg"> & { presentation?: "tall" },
): ReactElement {
  const { presentation, ...attributes } = props;
  return (
    <svg
      {...styledProps(
        attributes,
        s.graphic,
        presentation === "tall" && s.tallGraphic,
      )}
    />
  );
}

export function OperatorMapEmpty(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.empty)} />;
}

interface MapMetric {
  label: string;
  value: string | number;
}

export function OperatorMapSummary(
  props: Omit<ComponentProps<"div">, "children"> & {
    metrics: readonly [MapMetric, MapMetric, MapMetric];
    status: string;
    tone: "neutral" | "good" | "warn";
  },
): ReactElement {
  const { metrics, status, tone, ...attributes } = props;
  return (
    <div
      {...styledProps(attributes, s.summary)}
      role={attributes.role ?? "group"}
    >
      {metrics.map((metric, index) => (
        <dl key={`${index}:${metric.label}`} {...stylex.props(s.metric)}>
          <dt {...stylex.props(s.label)}>{metric.label}</dt>
          <dd {...stylex.props(s.valueCell)}>
            <strong {...stylex.props(s.value)}>{metric.value}</strong>
          </dd>
        </dl>
      ))}
      <p
        {...stylex.props(
          s.status,
          tone === "good" && s.good,
          tone === "warn" && s.warn,
        )}
        data-tone={tone}
      >
        <i {...stylex.props(s.statusDot)} aria-hidden="true" />
        {status}
      </p>
    </div>
  );
}
