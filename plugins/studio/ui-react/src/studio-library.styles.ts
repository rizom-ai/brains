import * as stylex from "@stylexjs/stylex";
export const libraryStyles: Record<
  | "frame"
  | "boot"
  | "listing"
  | "row"
  | "index"
  | "title"
  | "updated"
  | "empty"
  | "pagination"
  | "pager"
  | "range",
  stylex.StyleXStyles
> = stylex.create({
  frame: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    backgroundColor: "var(--console-frame)",
  },
  boot: { padding: 48 },
  listing: {
    width: "auto",
    margin: 0,
    padding: "26px 30px 34px",
    "@media (min-width: 901px)": { overflowY: "auto" },
    "@media (max-width: 640px)": {
      minWidth: 0,
      overflow: "visible",
      padding: "12px 16px calc(28px + env(safe-area-inset-bottom))",
    },
  },
  row: {
    display: "grid",
    gap: 18,
    alignItems: "baseline",
    width: "100%",
    padding: "15px 4px 14px",
    borderWidth: 0,
    borderBottom: "1px solid var(--console-rule-strong)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-card)",
    },
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: {
      default: "background-color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: ".12s",
    transitionTimingFunction: "ease",
    fontFamily: "var(--console-ui)",
    minHeight: 0,
    "@media (max-width: 640px)": {
      gap: "4px 10px",
      minHeight: 64,
      padding: "14px 2px",
    },
  },
  index: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text-muted)",
  },
  title: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 50, "opsz" 30',
    fontWeight: 520,
    fontSize: 17.5,
    letterSpacing: "-.005em",
    color: {
      default: "var(--console-text)",
      ":is([data-studio-record]:hover *)": "var(--console-accent-dim)",
    },
    "@media (max-width: 640px)": { fontSize: 17, lineHeight: 1.2 },
  },
  updated: {
    justifySelf: "auto",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-ui)",
    fontSize: 12.5,
    letterSpacing: 0,
    "@media (max-width: 640px)": {
      gridColumn: "3",
      gridRow: "1",
      alignSelf: "baseline",
      fontFamily: "var(--console-mono)",
      fontSize: 9,
    },
  },
  empty: { padding: "22px 4px" },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
    padding: "14px 4px 0",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    "@media (max-width: 640px)": {
      justifyContent: "space-between",
      gap: 8,
      paddingTop: 12,
    },
  },
  pager: { display: "inline-flex", gap: 6 },
  range: { whiteSpace: "nowrap" },
});
