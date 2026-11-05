import * as stylex from "@stylexjs/stylex";

export const logStyles: Record<
  | "root"
  | "group"
  | "groupLabel"
  | "rows"
  | "row"
  | "time"
  | "mark"
  | "copy"
  | "title"
  | "description"
  | "metadata",
  stylex.StyleXStyles
> = stylex.create({
  root: { display: "grid", gap: 22, minWidth: 0 },
  group: { display: "grid", gap: 4, minWidth: 0 },
  groupLabel: {
    margin: "0 0 4px",
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--console-text-muted)",
  },
  rows: { display: "grid", margin: 0, padding: 0, listStyle: "none" },
  row: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "52px 14px minmax(0, 1fr)",
    alignItems: "baseline",
    gap: 4,
    padding: "6px",
    borderRadius: 6,
    // The row a timeline light points at, after the light is chosen.
    backgroundColor: {
      default: null,
      ":is([data-timeline-active])": "var(--console-accent-soft)",
    },
    transitionProperty: "background-color",
    transitionDuration: "200ms",
  },
  time: {
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    color: "var(--console-text-muted)",
    fontVariantNumeric: "tabular-nums",
  },
  mark: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "currentColor",
    color: "var(--console-text-muted)",
    transform: "translateY(-1px)",
  },
  copy: { display: "grid", gap: 2, minWidth: 0 },
  title: {
    fontFamily: "var(--console-ui)",
    fontSize: 15,
    fontWeight: 500,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  description: {
    margin: 0,
    fontSize: 14,
    color: "var(--console-text-dim)",
  },
  metadata: {
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
});
