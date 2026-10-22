import * as stylex from "@stylexjs/stylex";
export const listStyles: Record<
  | "list"
  | "compactList"
  | "row"
  | "railed"
  | "compactRow"
  | "master"
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
  // Beside its actions while the row has room; in a narrow board column the
  // title takes the full width and the actions follow.
  row: {
    display: "flex",
    flexDirection: {
      default: "row",
      "@container operator-cell (max-width: 420px)": "column",
    },
    flexWrap: {
      default: "nowrap",
      "@media (max-width: 640px)": "wrap",
      "@container operator (max-width: 640px)": "wrap",
    },
    alignItems: {
      default: "center",
      "@container operator-cell (max-width: 420px)": "stretch",
    },
    justifyContent: "space-between",
    gap: {
      default: 20,
      "@media (max-width: 640px)": 12,
      "@container operator (max-width: 640px)": 12,
      "@container operator-cell (max-width: 420px)": 12,
    },
    // A board card sits tighter in its column, which pads the last one.
    padding: {
      default: "22px 0",
      ":is([data-matrix-cell] li)": "14px 0",
      ":is([data-matrix-cell] li:last-child)": "14px 0 4px",
    },
    borderBottomWidth: {
      default: 1,
      ":is([data-matrix-cell] li:last-child)": 0,
    },
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    minWidth: 0,
    position: "relative",
    // The row a timeline light points at, after the light is chosen.
    backgroundColor: {
      default: null,
      ":is([data-timeline-active])": "var(--console-accent-soft)",
    },
    boxShadow: {
      default: null,
      ":is([data-timeline-active])":
        "-8px 0 0 var(--console-accent-soft), 8px 0 0 var(--console-accent-soft)",
    },
    transitionProperty: "background-color, box-shadow",
    transitionDuration: "200ms",
  },
  railed: {
    paddingLeft: 16,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: {
      default: "var(--console-warn)",
      ":is([data-tone=error])": "var(--console-err)",
    },
  },
  compactRow: {
    padding: "13px 6px 13px 0",
    alignItems: "start",
    "@media (max-width: 720px)": {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
    },
    "@container operator (max-width: 720px)": {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
    },
  },
  // Beside an open detail every row keeps a gutter, so the open row's
  // marker never touches its text and titles stay aligned.
  master: { alignItems: "start", paddingLeft: 14, paddingRight: 14 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  stackedTrailing: { maxWidth: "100%", justifyContent: "flex-start" },
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
    justifyContent: {
      default: "flex-end",
      "@media (max-width: 640px)": "flex-start",
      "@container operator (max-width: 640px)": "flex-start",
      "@container operator-cell (max-width: 420px)": "flex-start",
    },
    gap: 8,
    minWidth: 0,
    maxWidth: {
      default: "40%",
      "@media (max-width: 720px)": "100%",
      "@container operator (max-width: 720px)": "100%",
      "@container operator-cell (max-width: 420px)": "100%",
    },
    flexShrink: 0,
    position: "relative",
    zIndex: 1,
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
    gap: "6px 14px",
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
  compactGood: { backgroundColor: "var(--console-ok-soft)" },
  compactWarn: {
    backgroundColor: "color-mix(in srgb,var(--console-warn) 15%,transparent)",
  },
  compactError: {
    backgroundColor: "color-mix(in srgb,var(--console-err) 15%,transparent)",
  },
});
