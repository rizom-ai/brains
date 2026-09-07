import * as stylex from "@stylexjs/stylex";

export const tableStyles: Record<
  "compact" | "scroll" | "table" | "row" | "head" | "cell",
  stylex.StyleXStyles
> = stylex.create({
  compact: {
    display: { default: "none", "@media (max-width: 640px)": "block" },
  },
  scroll: {
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "auto",
    display: {
      default: "block",
      "@media (max-width: 640px)": {
        default: "block",
        ':is([data-has-unannotated="false"])': "none",
      },
    },
    paddingBottom: {
      default: 0,
      "@media (max-width: 640px)": {
        default: 0,
        ':is([data-has-unannotated="true"])': 5,
      },
    },
    overscrollBehaviorInline: {
      default: "auto",
      "@media (max-width: 640px)": {
        default: "auto",
        ':is([data-has-unannotated="true"])': "contain",
      },
    },
    scrollbarWidth: {
      default: "auto",
      "@media (max-width: 640px)": {
        default: "auto",
        ':is([data-has-unannotated="true"])': "thin",
      },
    },
  },
  table: {
    width: "auto",
    minWidth: "min(100%, 520px)",
    maxWidth: "100%",
    borderCollapse: "collapse",
    color: "var(--console-text-dim)",
    fontSize: 12,
  },
  row: {
    display: {
      default: "table-row",
      "@media (max-width: 640px)": {
        default: "table-row",
        ':is([data-compact-row="true"])': "none",
      },
    },
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-card)",
      ':is([aria-current="true"])': "var(--console-card)",
    },
    boxShadow: {
      default: "none",
      ':is([aria-current="true"])': "inset 2px 0 0 var(--console-accent)",
    },
  },
  head: {
    paddingTop: 0,
    paddingBottom: 9,
    paddingRight: { default: 0, ":not(:last-child)": 40 },
    paddingLeft: { default: 0, ":last-child": 20 },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-text)",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    textAlign: {
      default: "left",
      ':is([data-align="center"])': "center",
      ':is([data-align="end"])': "right",
    },
  },
  cell: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: { default: 0, ":not(:last-child)": 40 },
    paddingLeft: { default: 0, ":last-child": 20 },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    color: {
      default: "var(--console-text-dim)",
      ":first-child": "var(--console-text)",
    },
    fontSize: { default: 13, ":first-child": 14 },
    fontWeight: { default: 400, ":first-child": 500 },
    verticalAlign: "middle",
    textAlign: {
      default: "left",
      ':is([data-align="center"])': "center",
      ':is([data-align="end"])': "right",
    },
  },
});
