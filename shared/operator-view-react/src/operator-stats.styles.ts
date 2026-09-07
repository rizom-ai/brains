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
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
});
