import * as stylex from "@stylexjs/stylex";
export const factStyles: Record<
  | "root"
  | "compactRoot"
  | "row"
  | "compactRow"
  | "label"
  | "value"
  | "compactValue"
  | "caption"
  | "referenceRoot"
  | "referenceRow"
  | "referenceLabel"
  | "referenceValue"
  | "good"
  | "warn"
  | "error",
  stylex.StyleXStyles
> = stylex.create({
  root: { margin: 0, minWidth: 0 },
  compactRoot: {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(80px,1fr) minmax(0,1.5fr)",
    alignItems: "baseline",
    gap: "6px 16px",
    paddingBlock: "15px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  compactRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBlock: "9px",
  },
  label: {
    minWidth: 0,
    fontFamily: "var(--console-ui)",
    fontSize: "12px",
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  value: {
    minWidth: 0,
    margin: 0,
    fontFamily: "var(--console-mono)",
    fontSize: "11px",
    lineHeight: 1.6,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  compactValue: { fontSize: "12px", textAlign: "left" },
  caption: {
    gridColumn: "1 / -1",
    flexBasis: "100%",
    margin: 0,
    minWidth: 0,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  referenceRoot: {
    display: "flex",
    flexDirection: "column",
    borderTopWidth: 0,
  },
  referenceRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,auto)",
    gap: 12,
    paddingBlock: 8,
    paddingInline: 0,
    borderBottomWidth: 0,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
  },
  referenceLabel: {
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    lineHeight: 1.5,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  referenceValue: {
    fontSize: 10.5,
    lineHeight: 1.5,
    fontVariantNumeric: "normal",
    textAlign: "right",
    color: "var(--console-text-dim)",
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
});
