import * as stylex from "@stylexjs/stylex";
export const collectionControlStyles: Record<
  | "controls"
  | "row"
  | "filters"
  | "summary"
  | "open"
  | "panel"
  | "state"
  | "scope"
  | "scopeChoice",
  stylex.StyleXStyles
> = stylex.create({
  scope: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    fontFamily: "var(--console-mono)",
    fontSize: 10,
  },
  scopeChoice: {
    padding: "6px 0",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    backgroundColor: "transparent",
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    ":is([aria-pressed=true])": {
      borderBottomColor: "var(--console-text)",
      color: "var(--console-text)",
    },
    "@media (max-width: 640px)": { minHeight: 44 },
  },
  controls: {
    paddingBlock: 14,
    borderBottom: "1px solid var(--console-rule)",
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
  // One instrument row: the query, its filters, and what it matched.
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  filters: { position: "relative" },
  summary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: { default: 38, "@media (max-width: 640px)": 44 },
    paddingInline: 11,
    // Longhands: a sibling style sets borderColor, and a shorthand loses to it.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 7,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text-dim)",
    fontSize: 13,
    listStyle: "none",
    cursor: "pointer",
    "::-webkit-details-marker": { display: "none" },
  },
  open: {
    borderColor: "var(--console-rule-accent)",
    color: "var(--console-text)",
  },
  // A panel rather than a stacked block, so opening filters never pushes the
  // collection down the page. Phones keep it in flow, where there is no room
  // to float it.
  panel: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: {
      default: "repeat(auto-fit, minmax(150px, 1fr))",
      "@media (max-width: 640px)": "minmax(0, 1fr)",
    },
    position: { default: "absolute", "@media (max-width: 640px)": "static" },
    zIndex: 6,
    insetBlockStart: {
      default: "calc(100% + 8px)",
      "@media (max-width: 640px)": "auto",
    },
    insetInlineStart: 0,
    width: { default: 420, "@media (max-width: 640px)": "100%" },
    maxWidth: "100%",
    marginBlockStart: { default: 0, "@media (max-width: 640px)": 10 },
    padding: { default: 14, "@media (max-width: 640px)": 0 },
    borderWidth: { default: 1, "@media (max-width: 640px)": 0 },
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 9,
    backgroundColor: {
      default: "var(--console-card)",
      "@media (max-width: 640px)": "transparent",
    },
    boxShadow: {
      default: "var(--console-shadow-card)",
      "@media (max-width: 640px)": "none",
    },
  },
  state: {
    marginInlineStart: "auto",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
});
