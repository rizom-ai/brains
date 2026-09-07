import * as stylex from "@stylexjs/stylex";
export const publicationStyles: Record<
  | "root"
  | "head"
  | "state"
  | "warning"
  | "error"
  | "good"
  | "copy"
  | "actions"
  | "button"
  | "publish"
  | "complete"
  | "confirmation",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    marginTop: 22,
    padding: 15,
    border: "1px solid var(--console-rule-strong)",
    borderLeft: "3px solid var(--console-accent)",
    borderRadius: 7,
    backgroundColor: "var(--console-card)",
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: "var(--console-text-muted)",
    font: "9px var(--console-mono)",
    letterSpacing: ".12em",
    textTransform: "uppercase",
  },
  state: { color: "var(--console-text-dim)", fontWeight: 500 },
  warning: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  good: { color: "var(--console-ok)" },
  copy: {
    margin: "10px 0 0",
    color: "var(--console-text-muted)",
    fontSize: 11,
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 13 },
  button: {
    minHeight: { default: 30, "@media (max-width: 640px)": 44 },
    padding: "6px 9px",
    fontSize: 10,
  },
  publish: {
    borderColor: "var(--console-accent)",
    backgroundColor: "var(--console-accent)",
    color: "var(--console-on-accent)",
  },
  complete: { color: "var(--console-ok)", fontFamily: "var(--console-mono)" },
  confirmation: {
    padding: "9px 11px",
    borderLeft: "2px solid var(--console-warn)",
    backgroundColor: "color-mix(in srgb, var(--console-warn) 7%, transparent)",
    font: "10px/1.5 var(--console-mono)",
  },
});
