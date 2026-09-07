import * as stylex from "@stylexjs/stylex";

export const mapStyles: Record<
  | "frame"
  | "split"
  | "joined"
  | "ambient"
  | "canvas"
  | "coordinates"
  | "graphic"
  | "tallGraphic"
  | "empty"
  | "summary"
  | "metric"
  | "value"
  | "valueCell"
  | "label"
  | "status"
  | "statusDot"
  | "good"
  | "warn",
  stylex.StyleXStyles
> = stylex.create({
  frame: {
    position: "relative",
    minWidth: 0,
    minHeight: { default: 360, "@media (max-width: 700px)": 260 },
    overflow: "hidden",
    isolation: "isolate",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "var(--console-bg-deep)",
    boxShadow: {
      default: "inset 0 2px 24px rgba(0,0,0,.5)",
      ':is([data-climate="paper"] *)': "inset 0 2px 18px rgba(90,60,20,.22)",
    },
  },
  split: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,2.25fr) minmax(250px,.75fr)",
      "@media (max-width: 700px)": "minmax(0,1fr)",
    },
    minHeight: { default: 480, "@media (max-width: 700px)": 0 },
  },
  joined: { borderRadius: "4px 4px 8px 8px" },
  ambient: {
    backgroundImage:
      "radial-gradient(circle at 36% 50%,color-mix(in srgb, var(--console-accent) 7%, transparent),transparent 32%),radial-gradient(circle at 58% 42%,color-mix(in srgb, var(--console-secondary) 13%, transparent),transparent 36%)",
  },
  canvas: {
    position: "relative",
    minWidth: 0,
    minHeight: { default: 0, "@media (max-width: 700px)": 320 },
    overflow: "hidden",
    backgroundImage:
      "linear-gradient(color-mix(in srgb, var(--console-secondary) 4%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--console-secondary) 4%, transparent) 1px,transparent 1px)",
    backgroundSize: "48px 48px",
    "::after": {
      position: "absolute",
      inset: 0,
      content: '""',
      pointerEvents: "none",
      backgroundImage:
        "linear-gradient(90deg,var(--console-bg-deep),transparent 11%,transparent 91%,var(--console-bg-deep))",
      opacity: 0.58,
    },
  },
  coordinates: {
    position: "absolute",
    zIndex: 2,
    inset: "15px 18px auto",
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 7,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  graphic: {
    display: "block",
    width: { default: "100%", "@media (max-width: 700px)": "155%" },
    height: "auto",
    minHeight: { default: 360, "@media (max-width: 700px)": 260 },
    maxWidth: { default: null, "@media (max-width: 700px)": "none" },
    transform: {
      default: "none",
      "@media (max-width: 700px)": "translateX(-18%)",
    },
  },
  tallGraphic: {
    position: "relative",
    zIndex: 1,
    width: { default: "100%", "@media (max-width: 700px)": "140%" },
    minHeight: { default: 480, "@media (max-width: 700px)": 320 },
    transform: {
      default: "none",
      "@media (max-width: 700px)": "translateX(-15%)",
    },
  },
  empty: {
    display: "grid",
    gridColumn: "1 / -1",
    minWidth: 0,
    minHeight: { default: 360, "@media (max-width: 700px)": 260 },
    placeItems: "center",
    padding: 28,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-display)",
    fontSize: 17,
    fontStyle: "italic",
    textAlign: "center",
    overflowWrap: "anywhere",
  },
  summary: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr) fit-content(35%)",
      "@media (max-width: 700px)": "repeat(3,minmax(0,1fr))",
    },
    alignItems: "center",
    minWidth: 0,
    minHeight: 64,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "8px 8px 4px 4px",
    backgroundColor:
      "color-mix(in srgb, var(--console-bg-deep) 64%, transparent)",
  },
  metric: {
    display: "flex",
    flexDirection: "column-reverse",
    minWidth: 0,
    margin: 0,
    padding: { default: "0 18px", "@media (max-width: 700px)": "0 10px" },
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--console-rule)",
    overflowWrap: "anywhere",
  },
  valueCell: { margin: 0 },
  value: {
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: { default: 23, "@media (max-width: 700px)": 20 },
    fontVariationSettings: '"opsz" 72, "SOFT" 20',
    fontWeight: 430,
    lineHeight: 1,
  },
  label: {
    marginTop: 6,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: { default: 8, "@media (max-width: 700px)": 6.5 },
    lineHeight: { default: 1.5, "@media (max-width: 700px)": 1.4 },
    letterSpacing: ".13em",
    textTransform: "uppercase",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    margin: { default: "0 18px", "@media (max-width: 700px)": 0 },
    padding: { default: 0, "@media (max-width: 700px)": "0 10px" },
    minWidth: 0,
    minHeight: { default: 0, "@media (max-width: 700px)": 36 },
    gridColumn: { default: "auto", "@media (max-width: 700px)": "1 / -1" },
    borderTopWidth: { default: 0, "@media (max-width: 700px)": 1 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  statusDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: "50%",
    backgroundColor: "currentColor",
    boxShadow: "0 0 0 5px color-mix(in srgb, currentColor 9%, transparent)",
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
});
