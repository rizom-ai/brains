import * as stylex from "@stylexjs/stylex";
export const statsStyles: Record<
  | "root"
  | "item"
  | "label"
  | "value"
  | "caption"
  | "compact"
  | "compactItem"
  | "compactLabel"
  | "compactValue"
  | "head"
  | "headItem"
  | "headValue"
  | "ledger"
  | "ledgerItem"
  | "ledgerLabel"
  | "ledgerValue"
  | "good"
  | "warn"
  | "error",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px 24px",
    margin: 0,
    minWidth: 0,
  },
  item: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
    minWidth: 0,
  },
  label: {
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  value: {
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  caption: {
    flexBasis: "100%",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    overflowWrap: "anywhere",
  },
  compact: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(min(128px,100%),1fr))",
    gap: 1,
    backgroundColor: "var(--console-rule)",
  },
  compactItem: {
    display: "block",
    padding: "13px 16px 15px",
    backgroundColor: "var(--console-frame)",
  },
  compactLabel: {
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".14em",
    textTransform: "uppercase",
  },
  compactValue: {
    marginTop: 6,
    fontFamily: "var(--console-display)",
    fontSize: 23,
    fontVariationSettings: '"SOFT" 40',
    fontWeight: 560,
    lineHeight: 1,
  },
  head: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 18,
    backgroundColor: "transparent",
  },
  headItem: { padding: 0, backgroundColor: "transparent" },
  headValue: { fontSize: 27 },
  ledger: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(4,minmax(0,1fr))",
      "@media (max-width: 640px)": "repeat(2,minmax(0,1fr))",
    },
    gap: 0,
    alignItems: "stretch",
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-rule)",
  },
  ledgerItem: {
    display: "block",
    padding: "13px 12px",
    backgroundColor: "transparent",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--console-rule)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  ledgerLabel: {
    overflow: "hidden",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    letterSpacing: "0.1em",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  ledgerValue: {
    marginTop: 5,
    fontFamily: "var(--console-display)",
    fontSize: { default: 28, "@media (max-width: 640px)": 25 },
    fontVariationSettings: '"SOFT" 35, "opsz" 58',
    fontWeight: 470,
    lineHeight: 1,
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
});
