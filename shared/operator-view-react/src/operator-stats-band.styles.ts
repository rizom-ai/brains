import * as stylex from "@stylexjs/stylex";

/** Edge-aligned totals paired with a flush-bottom panel. */
export const statsBandStyles: Record<
  "root" | "item" | "label" | "value" | "caption",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3,minmax(0,1fr))",
      "@media (max-width: 700px)": "minmax(0,1fr)",
    },
    margin: "0 -18px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    backgroundColor:
      "color-mix(in srgb, var(--console-card-soft) 32%, transparent)",
  },
  item: {
    minWidth: 0,
    padding: "12px 18px 14px",
    borderLeftWidth: {
      default: 1,
      ":first-child": 0,
      "@media (max-width: 700px)": 0,
    },
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-rule)",
    borderTopWidth: {
      default: 0,
      "@media (max-width: 700px)": { default: 1, ":first-child": 0 },
    },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    overflowWrap: "anywhere",
  },
  label: {
    display: "block",
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  value: {
    display: "inline-block",
    margin: "4px 0 0",
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: 23,
    fontWeight: 500,
  },
  caption: {
    display: "inline-block",
    margin: "0 0 0 6px",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
});
