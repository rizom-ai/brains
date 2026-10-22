import * as stylex from "@stylexjs/stylex";

// The day's lights come on left to right once, when the timeline mounts.
const lightOn = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.4)" },
  to: { opacity: 1, transform: "scale(1)" },
});

export const timelineStyles: Record<
  | "root"
  | "head"
  | "label"
  | "count"
  | "band"
  | "tick"
  | "tickLabel"
  | "now"
  | "light"
  | "dot"
  | "failedDot"
  | "activeDot"
  | "legend"
  | "legendItem"
  | "legendMark"
  | "empty",
  stylex.StyleXStyles
> = stylex.create({
  root: { display: "grid", gap: 10, minWidth: 0 },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
  label: { fontWeight: 600, color: "var(--console-text)" },
  count: { fontVariantNumeric: "tabular-nums" },
  band: {
    position: "relative",
    height: 108,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "var(--console-bg-deep)",
    boxShadow: "inset 0 0 0 1px var(--console-rule)",
    "@media (max-width: 640px)": { height: 96 },
  },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderLeftStyle: "dashed",
    borderLeftColor: "var(--console-rule-strong)",
  },
  tickLabel: {
    position: "absolute",
    bottom: 6,
    left: 6,
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text-muted)",
    whiteSpace: "nowrap",
  },
  now: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "calc(100% - 19px)",
    width: 2,
    backgroundColor: "var(--console-accent)",
  },
  light: {
    position: "absolute",
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    padding: 0,
    borderWidth: 0,
    borderRadius: "50%",
    backgroundColor: "transparent",
    color: "var(--console-text-muted)",
    cursor: "pointer",
    transform: "translate(-50%, -50%)",
    outlineOffset: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    backgroundColor: "currentColor",
    boxShadow: "0 0 10px 1px color-mix(in srgb, currentColor 45%, transparent)",
    transform: { default: "scale(1)", ":is(:hover > *)": "scale(1.35)" },
    transitionProperty: "transform",
    transitionDuration: "150ms",
    animationName: lightOn,
    animationDuration: "500ms",
    animationFillMode: "backwards",
    animationTimingFunction: "ease-out",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
      transitionDuration: "0s",
    },
  },
  failedDot: {
    width: 16,
    height: 16,
    outlineWidth: 1.5,
    outlineStyle: "solid",
    outlineColor: "color-mix(in srgb, currentColor 50%, transparent)",
    outlineOffset: 3,
    boxShadow: "0 0 16px 4px color-mix(in srgb, currentColor 55%, transparent)",
  },
  activeDot: { transform: "scale(1.5)" },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 18px",
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  legendMark: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
  empty: { color: "var(--console-text-muted)" },
});
