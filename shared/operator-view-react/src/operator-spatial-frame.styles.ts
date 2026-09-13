import * as stylex from "@stylexjs/stylex";

/** Presentation only: geometry and relationship admission stay in the renderer. */
export const spatialFrameStyles: Record<
  | "frame"
  | "canvas"
  | "overlay"
  | "boundary"
  | "zone"
  | "relationship"
  | "center",
  stylex.StyleXStyles
> = stylex.create({
  frame: {
    display: "grid",
    gap: 12,
    minWidth: 0,
    margin: 0,
    padding: "14px 16px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "var(--console-card)",
  },
  canvas: {
    position: "relative",
    minWidth: 0,
    minHeight: "clamp(280px, 42vw, 480px)",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 8,
    backgroundImage:
      "radial-gradient(circle at center, transparent 0 30%, var(--console-card-soft) 100%)",
    backgroundColor: "var(--console-card)",
  },
  overlay: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  boundary: {
    fill: "none",
    stroke: "var(--console-rule-strong)",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke",
  },
  zone: {
    fill: "color-mix(in srgb, var(--console-accent) 5%, transparent)",
    strokeDasharray: "4 6",
  },
  relationship: {
    stroke: {
      default: "var(--console-rule-strong)",
      ':is([data-tone="good"])': "var(--console-ok)",
      ':is([data-tone="warn"])': "var(--console-warn)",
    },
    strokeWidth: 1,
    vectorEffect: "non-scaling-stroke",
  },
  center: {
    position: "absolute",
    top: "50%",
    left: "50%",
    zIndex: 2,
    maxWidth: 120,
    padding: "6px 9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-accent)",
    borderRadius: 999,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    textAlign: "center",
    transform: "translate(-50%, -50%)",
    overflowWrap: "anywhere",
  },
});
