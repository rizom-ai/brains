import * as stylex from "@stylexjs/stylex";

export const mapDetailsStyles: Record<
  | "index"
  | "heading"
  | "title"
  | "description"
  | "list"
  | "item"
  | "control"
  | "rank"
  | "label"
  | "value"
  | "remainder"
  | "note"
  | "legend"
  | "legendItem"
  | "marker"
  | "dot"
  | "dashed"
  | "neutral"
  | "secondary"
  | "good"
  | "warn"
  | "legendNote",
  stylex.StyleXStyles
> = stylex.create({
  index: {
    position: "relative",
    zIndex: 2,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: { default: "auto", "@media (max-width: 700px)": 270 },
    borderLeftWidth: { default: 1, "@media (max-width: 700px)": 0 },
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-rule-strong)",
    borderTopWidth: { default: 0, "@media (max-width: 700px)": 1 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
    backgroundImage:
      "linear-gradient(180deg,color-mix(in srgb, var(--console-card-soft) 42%, transparent),color-mix(in srgb, var(--console-frame) 52%, transparent))",
  },
  heading: {
    flexShrink: 0,
    padding: "18px 18px 14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  title: {
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: 20,
    fontVariationSettings: '"SOFT" 35',
    fontWeight: 460,
    lineHeight: 1.1,
    overflowWrap: "anywhere",
  },
  description: {
    margin: "4px 0 0",
    color: "var(--console-text-muted)",
    fontSize: 11,
    overflowWrap: "anywhere",
  },
  list: {
    flexShrink: 0,
    display: { default: "block", "@media (max-width: 700px)": "grid" },
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    margin: 0,
    padding: "6px 0",
    listStyle: "none",
  },
  item: { minWidth: 0 },
  control: {
    display: "grid",
    gridTemplateColumns: "18px minmax(0,1fr) fit-content(30%)",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    minHeight: { default: 39, "@media (max-width: 700px)": 44 },
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: { default: 14, "@media (max-width: 700px)": 11 },
    paddingRight: { default: 16, "@media (max-width: 700px)": 11 },
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: {
      default: "transparent",
      ":hover": "var(--console-secondary)",
      ":focus-visible": "var(--console-secondary)",
      ':is([aria-pressed="true"])': "var(--console-secondary)",
    },
    outlineWidth: 0,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-secondary-soft)",
      ":focus-visible": "var(--console-secondary-soft)",
      ':is([aria-pressed="true"])': "var(--console-secondary-soft)",
    },
    color: {
      default: "var(--console-text-muted)",
      ":hover": "var(--console-text)",
      ":focus-visible": "var(--console-text)",
      ':is([aria-pressed="true"])': "var(--console-text)",
    },
    cursor: "pointer",
    textAlign: "left",
  },
  rank: {
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8,
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    color: "currentColor",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: ".045em",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  value: {
    minWidth: 25,
    color: "var(--console-secondary)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    fontWeight: 500,
    textAlign: "right",
    overflowWrap: "anywhere",
  },
  remainder: {
    flexShrink: 0,
    margin: 0,
    padding: "11px 18px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-display)",
    fontSize: 11,
    fontStyle: "italic",
    overflowWrap: "anywhere",
  },
  note: {
    flexShrink: 0,
    display: { default: "block", "@media (max-width: 700px)": "none" },
    margin: "auto 16px 16px",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8,
    letterSpacing: ".08em",
    lineHeight: 1.55,
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: { default: "8px 20px", "@media (max-width: 700px)": "7px 14px" },
    marginTop: 12,
    minWidth: 0,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    letterSpacing: ".09em",
    textTransform: "uppercase",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  marker: {
    width: 8,
    height: 8,
    flexShrink: 0,
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "currentColor",
    borderRadius: "50%",
    backgroundColor: "transparent",
  },
  dot: { borderColor: "transparent", backgroundColor: "currentColor" },
  dashed: { borderStyle: "dashed" },
  neutral: { color: "var(--console-text-faint)" },
  secondary: { color: "var(--console-secondary)" },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  legendNote: {
    marginLeft: { default: "auto", "@media (max-width: 700px)": 0 },
    flexBasis: { default: "auto", "@media (max-width: 700px)": "100%" },
    minWidth: 0,
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-display)",
    fontSize: 12,
    fontStyle: "italic",
    letterSpacing: 0,
    textTransform: "none",
    overflowWrap: "anywhere",
  },
});
