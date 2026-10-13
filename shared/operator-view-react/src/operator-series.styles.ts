import * as stylex from "@stylexjs/stylex";

export const seriesStyles: Record<
  | "figure"
  | "caption"
  | "chart"
  | "hit"
  | "marker"
  | "bar"
  | "good"
  | "warn"
  | "error"
  | "missing"
  | "axis"
  | "peak",
  stylex.StyleXStyles
> = stylex.create({
  figure: {
    display: "grid",
    gap: "8px",
    margin: 0,
    minWidth: 0,
  },
  caption: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: "10px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  chart: {
    display: "block",
    width: "100%",
    height: "140px",
    overflow: "visible",
  },
  hit: {
    fill: "transparent",
  },
  marker: {
    fill: "var(--console-accent-soft)",
  },
  bar: {
    fill: {
      default: "color-mix(in srgb, var(--console-accent) 72%, transparent)",
      ":hover": "var(--console-accent)",
    },
    transition: "fill 120ms ease",
  },
  good: { fill: "var(--console-ok)" },
  warn: { fill: "var(--console-warn)" },
  error: { fill: "var(--console-err)" },
  missing: {
    fill: "none",
    stroke: "var(--console-rule-strong)",
    strokeDasharray: "2 2",
  },
  axis: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: "10px",
    letterSpacing: "0.06em",
  },
  peak: {
    color: "var(--console-text-muted)",
  },
});
