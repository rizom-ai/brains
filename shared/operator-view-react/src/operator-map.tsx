/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { mapStyles as s } from "./operator-map.styles";

/** Hosts supply the visualization, supporting content, and all data interpretation. */
export function OperatorMapFrame(
  props: ComponentProps<"div"> & {
    layout?: "split";
    joined?: boolean;
    ambient?: boolean;
  },
): ReactElement {
  const { layout, joined, ambient, ...attributes } = props;
  const css = stylex.props(
    s.frame,
    layout === "split" && s.split,
    joined && s.joined,
    ambient && s.ambient,
  );
  return (
    <div
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function OperatorMapCanvas(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.canvas);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
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
  const css = stylex.props(s.graphic, presentation === "tall" && s.tallGraphic);
  return (
    <svg
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function OperatorMapEmpty(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.empty);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
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
  const css = stylex.props(s.summary);
  return (
    <div
      {...attributes}
      {...css}
      role={attributes.role ?? "group"}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
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
