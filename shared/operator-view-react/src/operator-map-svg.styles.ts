import * as stylex from "@stylexjs/stylex";

const draw = stylex.keyframes({ to: { strokeDashoffset: 0 } });
const bloom = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0)" },
  to: { opacity: 1, transform: "scale(1)" },
});
const breathe = stylex.keyframes({
  "50%": { opacity: 0.58, transform: "scale(1.2)" },
});
const flicker = stylex.keyframes({ "50%": { opacity: 0.85 } });
const drift = stylex.keyframes({
  "0%": { opacity: 0, transform: "translateY(12px)" },
  "20%": { opacity: 0.34 },
  "82%": { opacity: 0.24 },
  "100%": { opacity: 0, transform: "translateY(-24px)" },
});

export const mapSvgStyles: Record<
  | "trace"
  | "major"
  | "contour"
  | "middle"
  | "inner"
  | "draw"
  | "bloom"
  | "anchor"
  | "point"
  | "pointGood"
  | "pointWarn"
  | "pointSecondary"
  | "nodeGood"
  | "hollow"
  | "distance"
  | "region"
  | "spore"
  | "connector"
  | "identity"
  | "halo"
  | "glow"
  | "stem"
  | "node"
  | "nodeWarn"
  | "nodeSecondary"
  | "dimmed"
  | "regionText"
  | "count"
  | "axisText"
  | "distanceText"
  | "groupText"
  | "identityText"
  | "nodeText"
  | "labelBase",
  stylex.StyleXStyles
> = stylex.create({
  trace: {
    fill: "none",
    stroke: "var(--console-secondary)",
    strokeLinecap: "round",
    strokeDasharray: "1",
    strokeDashoffset: {
      default: 1,
      "@media (prefers-reduced-motion: reduce)": 0,
    },
    opacity: { default: 0.13, "@media (prefers-reduced-motion: reduce)": 1 },
    strokeWidth: 0.7,
  },
  major: {
    opacity: { default: 0.24, "@media (prefers-reduced-motion: reduce)": 1 },
    strokeDasharray: "3 7",
  },
  contour: {
    fill: {
      default: "color-mix(in srgb, var(--console-secondary) 2.5%, transparent)",
      [stylex.when.ancestor('[data-map-active="true"]')]:
        "color-mix(in srgb, var(--console-secondary) 6.5%, transparent)",
    },
    stroke: "var(--console-secondary)",
    strokeLinecap: "round",
    strokeDasharray: "1",
    strokeDashoffset: {
      default: 1,
      "@media (prefers-reduced-motion: reduce)": 0,
    },
    strokeOpacity: {
      default: 0.23,
      [stylex.when.ancestor('[data-map-active="true"]')]: 0.58,
    },
    strokeWidth: 0.85,
  },
  middle: {
    fill: {
      default: "color-mix(in srgb, var(--console-secondary) 4%, transparent)",
      [stylex.when.ancestor('[data-map-active="true"]')]:
        "color-mix(in srgb, var(--console-secondary) 6.5%, transparent)",
    },
    strokeOpacity: {
      default: 0.34,
      [stylex.when.ancestor('[data-map-active="true"]')]: 0.58,
    },
  },
  inner: {
    strokeOpacity: {
      default: 0.22,
      [stylex.when.ancestor('[data-map-active="true"]')]: 0.58,
    },
  },
  draw: {
    animationName: {
      default: draw,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1.15s",
    animationTimingFunction: "cubic-bezier(.3,.6,.3,1)",
    animationFillMode: "forwards",
  },
  bloom: {
    transformBox: "fill-box",
    transformOrigin: "center",
    animationName: {
      default: bloom,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    opacity: 1,
    transform: "none",
    animationDuration: ".55s",
    animationTimingFunction: "cubic-bezier(.2,.9,.3,1.4)",
    animationFillMode: "both",
  },
  anchor: { fill: "var(--console-secondary)", opacity: 0.72 },
  point: { fill: "var(--console-text-faint)" },
  pointGood: { fill: "var(--console-ok)" },
  pointWarn: { fill: "var(--console-warn)" },
  hollow: { fill: "none", stroke: "var(--console-text-dim)", strokeWidth: 1 },
  pointSecondary: { fill: "var(--console-secondary)" },
  nodeGood: { fill: "var(--console-ok)", stroke: "var(--console-ok)" },
  distance: {
    fill: "none",
    stroke: "var(--console-rule-strong)",
    strokeDasharray: "2 7",
    strokeWidth: 0.8,
  },
  region: {
    fill: "color-mix(in srgb, var(--console-secondary) 6%, transparent)",
    stroke: "var(--console-secondary)",
    strokeDasharray: "4 7",
    strokeOpacity: 0.48,
    strokeWidth: 0.9,
  },
  spore: {
    fill: "var(--console-text-faint)",
    opacity: { default: 0, "@media (prefers-reduced-motion: reduce)": 1 },
    transform: "none",
    animationName: {
      default: drift,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "11s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  connector: {
    fill: "none",
    stroke: "var(--console-ok)",
    strokeOpacity: 0.24,
    strokeWidth: 0.9,
  },
  identity: {
    fill: "var(--console-accent)",
    filter: "drop-shadow(0 0 7px var(--console-accent))",
  },
  halo: {
    transformBox: "fill-box",
    transformOrigin: "center",
    animationName: {
      default: breathe,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    opacity: 1,
    transform: "none",
    animationDuration: "5.2s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  glow: {
    fill: "var(--console-warn)",
    opacity: { default: 0.38, "@media (prefers-reduced-motion: reduce)": 1 },
    animationName: {
      default: flicker,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "4.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  stem: {
    fill: "none",
    stroke: "var(--console-warn)",
    strokeLinecap: "round",
    strokeWidth: 1.2,
  },
  node: {
    fill: "var(--console-text-muted)",
    stroke: "var(--console-text-dim)",
    strokeWidth: 1,
  },
  nodeWarn: {
    fill: "var(--console-warn)",
    stroke: "color-mix(in srgb, var(--console-warn) 70%, white)",
  },
  nodeSecondary: {
    fill: "var(--console-secondary)",
    stroke: "var(--console-secondary)",
  },
  dimmed: { opacity: 0.25 },
  labelBase: {
    stroke: "var(--console-bg-deep)",
    strokeWidth: 4,
    paintOrder: "stroke",
    fontFamily: "var(--console-mono)",
    textTransform: "uppercase",
  },
  regionText: {
    fill: "var(--console-text-dim)",
    fontSize: { default: 8.5, "@media (max-width: 700px)": 10 },
    fontWeight: 500,
    letterSpacing: ".08em",
  },
  count: {
    fill: "var(--console-secondary)",
    fontSize: { default: 9, "@media (max-width: 700px)": 10 },
    fontWeight: 600,
  },
  axisText: {
    fill: "var(--console-text-faint)",
    fontSize: 7,
    letterSpacing: ".1em",
  },
  distanceText: {
    fill: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: { default: 8, "@media (max-width: 700px)": 12 },
    letterSpacing: ".08em",
  },
  groupText: {
    fill: "var(--console-secondary)",
    fontSize: { default: 8, "@media (max-width: 700px)": 12 },
    fontWeight: 600,
    letterSpacing: ".16em",
  },
  identityText: {
    fill: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: { default: 8, "@media (max-width: 700px)": 12 },
    letterSpacing: ".22em",
    textTransform: "uppercase",
  },
  nodeText: {
    fill: "var(--console-text-muted)",
    stroke: "var(--console-bg-deep)",
    strokeWidth: 3,
    paintOrder: "stroke",
    fontFamily: "var(--console-mono)",
    fontSize: { default: 9, "@media (max-width: 700px)": 16 },
    letterSpacing: ".06em",
  },
});
