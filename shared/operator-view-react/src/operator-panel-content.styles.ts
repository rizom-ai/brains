import * as stylex from "@stylexjs/stylex";

export const panelContentStyles: Record<
  | "paragraph"
  | "note"
  | "muted"
  | "lead"
  | "status"
  | "good"
  | "warn"
  | "error"
  | "empty"
  | "list"
  | "row"
  | "link"
  | "copy"
  | "label"
  | "description"
  | "badge"
  | "secondaryBadge"
  | "goodBadge"
  | "marker",
  stylex.StyleXStyles
> = stylex.create({
  muted: {
    margin: 0,
    color: "var(--console-text-muted)",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  note: {
    margin: 0,
    color: "var(--console-text-muted)",
    fontSize: 11.5,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  },
  paragraph: {
    maxWidth: "66ch",
    margin: "0 0 12px",
    color: "var(--console-text-dim)",
    fontSize: { default: 14, "@media (max-width: 640px)": 13 },
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  lead: { color: "var(--console-text)", fontWeight: 560 },
  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    letterSpacing: "0.08em",
    overflowWrap: "anywhere",
    "::before": {
      content: '""',
      width: 7,
      height: 7,
      flexShrink: 0,
      borderRadius: "50%",
      backgroundColor: "currentColor",
      boxShadow: "0 0 0 4px color-mix(in srgb, currentColor 14%, transparent)",
    },
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  empty: {
    margin: 0,
    padding: "9px 0",
    color: "var(--console-text-muted)",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  list: { margin: 0, padding: 0, listStyleType: "none" },
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    paddingTop: { default: 8, ":first-child": 2 },
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
  },
  link: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    minWidth: 0,
    color: "inherit",
    textDecorationLine: "none",
    minHeight: { default: null, "@media (max-width: 640px)": 44 },
    ":focus-visible": {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: "var(--console-accent)",
      outlineOffset: 3,
    },
  },
  copy: { minWidth: 0, overflowWrap: "anywhere" },
  label: {
    display: "block",
    color: {
      default: "var(--console-text)",
      [stylex.when.ancestor(":hover")]: "var(--console-accent)",
    },
    fontSize: 13.5,
    fontWeight: 560,
    transitionProperty: "color",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  description: {
    display: "block",
    maxWidth: "55ch",
    marginTop: 1,
    color: "var(--console-text-muted)",
    fontSize: { default: 11.5, "@media (max-width: 640px)": 10.5 },
    fontStyle: "normal",
  },
  badge: {
    flex: "0 0 auto",
    minWidth: 0,
    maxWidth: "40%",
    overflowWrap: "anywhere",
    padding: "2px 7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 4,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  secondaryBadge: {
    borderColor:
      "color-mix(in srgb, var(--console-secondary) 38%, transparent)",
    color: "var(--console-secondary)",
  },
  goodBadge: {
    borderColor: "color-mix(in srgb, var(--console-ok) 38%, transparent)",
    color: "var(--console-ok)",
  },
  marker: {
    display: "inline-block",
    width: 7,
    height: 7,
    marginRight: 9,
    borderRadius: "50%",
    backgroundColor: "var(--console-ok)",
    verticalAlign: 1,
  },
});
