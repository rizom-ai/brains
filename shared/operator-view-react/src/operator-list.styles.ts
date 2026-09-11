import * as stylex from "@stylexjs/stylex";
export const listStyles: Record<
  | "list"
  | "compactList"
  | "row"
  | "compactRow"
  | "master"
  | "selected"
  | "interactive"
  | "trailing"
  | "stacked"
  | "stackedTrailing"
  | "count"
  | "links"
  | "footerMetadata"
  | "tags"
  | "badge"
  | "compactBadge"
  | "good"
  | "warn"
  | "error"
  | "compactGood"
  | "compactWarn"
  | "compactError"
  | "controls",
  stylex.StyleXStyles
> = stylex.create({
  list: { listStyle: "none", margin: 0, padding: 0, minWidth: 0 },
  compactList: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    padding: "22px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    minWidth: 0,
    position: "relative",
    "@media (max-width: 640px)": { flexWrap: "wrap", gap: 12 },
  },
  compactRow: {
    padding: "13px 6px 13px 0",
    alignItems: "start",
    "@media (max-width: 720px)": {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
    },
  },
  master: { alignItems: "start" },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  stackedTrailing: { maxWidth: "100%", justifyContent: "flex-start" },
  selected: { backgroundColor: "var(--console-accent-soft)" },
  interactive: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-card)",
    },
  },
  trailing: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
    maxWidth: { default: "40%", "@media (max-width: 720px)": "100%" },
    flexShrink: 0,
    position: "relative",
    zIndex: 1,
    "@media (max-width: 640px)": { justifyContent: "flex-start" },
  },
  controls: { position: "relative", zIndex: 1, minWidth: 0 },
  count: {
    minWidth: 0,
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    overflowWrap: "anywhere",
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 12,
    position: "relative",
    zIndex: 1,
  },
  footerMetadata: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    lineHeight: 1.6,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  tags: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 },
  badge: {
    maxWidth: "100%",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  compactBadge: {
    padding: "2px 9px",
    borderRadius: 999,
    backgroundColor: "color-mix(in srgb,var(--console-text) 7%,transparent)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  compactGood: { backgroundColor: "var(--console-ok-soft)" },
  compactWarn: {
    backgroundColor: "color-mix(in srgb,var(--console-warn) 15%,transparent)",
  },
  compactError: {
    backgroundColor: "color-mix(in srgb,var(--console-err) 15%,transparent)",
  },
});
