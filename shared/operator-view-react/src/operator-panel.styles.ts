import * as stylex from "@stylexjs/stylex";

export const panelStyles: Record<
  | "panel"
  | "tight"
  | "flushBottom"
  | "fullWidth"
  | "neutralWash"
  | "goodWash"
  | "heading"
  | "title"
  | "source"
  | "grid",
  stylex.StyleXStyles
> = stylex.create({
  panel: {
    backgroundColor: "var(--console-card)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: { default: 10, "@media (max-width: 640px)": 9 },
    padding: { default: "14px 18px 16px", "@media (max-width: 640px)": 14 },
    position: "relative",
    minWidth: 0,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    containerName: "operator-panel",
    containerType: "inline-size",
  },
  tight: {
    padding: { default: "14px 18px 16px", "@media (max-width: 640px)": 12 },
  },
  flushBottom: { padding: "16px 18px 0", overflow: "hidden" },
  fullWidth: { gridColumn: "1 / -1" },
  neutralWash: {
    backgroundImage:
      "linear-gradient(135deg,color-mix(in srgb, var(--console-text) 2.5%, transparent),transparent 48%)",
  },
  goodWash: {
    backgroundImage:
      "linear-gradient(135deg,var(--console-ok-soft),transparent 55%)",
  },
  heading: {
    display: "flex",
    alignItems: {
      default: "baseline",
      "@media (max-width: 640px)": "flex-start",
    },
    justifyContent: "space-between",
    gap: 10,
    marginBottom: { default: 12, "@media (max-width: 640px)": 10 },
  },
  title: {
    minWidth: 0,
    fontFamily: "var(--console-mono)",
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--console-text-muted)",
  },
  source: {
    minWidth: 0,
    fontFamily: "var(--console-mono)",
    fontSize: { default: 10, "@media (max-width: 640px)": 8.5 },
    letterSpacing: "0.04em",
    color: "var(--console-text-faint)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2,minmax(0,1fr))",
      "@media (max-width: 900px)": "minmax(0,1fr)",
    },
    gap: { default: 14, "@media (max-width: 640px)": 9 },
    alignItems: "start",
  },
});
