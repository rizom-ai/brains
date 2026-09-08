import * as stylex from "@stylexjs/stylex";

export const statusStyles: Record<
  | "dot"
  | "good"
  | "warn"
  | "error"
  | "cautionGlow"
  | "row"
  | "copy"
  | "label"
  | "status",
  stylex.StyleXStyles
> = stylex.create({
  dot: {
    display: "inline-block",
    flexShrink: 0,
    width: 6,
    height: 6,
    marginRight: 6,
    borderRadius: "50%",
    backgroundColor: "currentColor",
    boxShadow: "0 0 7px color-mix(in srgb, currentColor 70%, transparent)",
    verticalAlign: 1,
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  cautionGlow: {
    boxShadow: "0 0 7px color-mix(in srgb, currentColor 60%, transparent)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 0,
    gap: 8,
    padding: "9px 0",
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
  },
  copy: { display: "flex", alignItems: "center", gap: 2, minWidth: 0 },
  label: {
    color: "var(--console-text-dim)",
    fontSize: 12,
    fontWeight: 500,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  status: {
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    flexShrink: 0,
    maxWidth: "45%",
    overflowWrap: "anywhere",
  },
});
