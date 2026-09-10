import * as stylex from "@stylexjs/stylex";
export const progressStyles: Record<
  | "meters"
  | "meter"
  | "label"
  | "value"
  | "frame"
  | "header"
  | "title"
  | "state"
  | "detail"
  | "time"
  | "bar"
  | "good"
  | "warn"
  | "error",
  stylex.StyleXStyles
> = stylex.create({
  meters: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
      ":is([data-operator-card-body] *)": "repeat(2, minmax(0, 1fr))",
    },
    gap: { default: "16px 20px", ":is([data-operator-card-body] *)": 12 },
    margin: 0,
    minWidth: 0,
  },
  meter: { minWidth: 0 },
  label: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  value: {
    margin: "5px 0 0",
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 15,
    overflowWrap: "anywhere",
  },
  frame: {
    minWidth: 0,
    padding: "14px 16px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "var(--console-card)",
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  title: {
    color: "var(--console-text)",
    fontSize: 13.5,
    fontWeight: 550,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  state: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  detail: {
    margin: "8px 0 0",
    color: "var(--console-text-dim)",
    fontSize: 12.5,
    overflowWrap: "anywhere",
  },
  time: {
    display: "block",
    marginTop: 10,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    overflowWrap: "anywhere",
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  bar: {
    display: "block",
    width: "100%",
    height: 4,
    marginTop: 8,
    appearance: "none",
    borderWidth: 0,
    borderRadius: {
      default: 999,
      "::-webkit-progress-bar": 999,
      "::-webkit-progress-value": 999,
      "::-moz-progress-bar": 999,
    },
    backgroundColor: {
      default: "var(--console-rule)",
      "::-webkit-progress-bar": "var(--console-rule)",
      "::-webkit-progress-value": "var(--console-accent)",
      "::-moz-progress-bar": "var(--console-accent)",
    },
    accentColor: "var(--console-accent)",
  },
});
