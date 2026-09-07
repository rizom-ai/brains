import * as stylex from "@stylexjs/stylex";

export const tabStripStyles: Record<
  "list" | "button" | "count",
  stylex.StyleXStyles
> = stylex.create({
  list: {
    display: "flex",
    gap: { default: 24, "@media (max-width: 900px)": 20 },
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    paddingBottom: 2,
    minWidth: 0,
    overflowX: "auto",
    overscrollBehaviorInline: "contain",
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
  },
  button: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 8,
    flexShrink: 0,
    marginBottom: -1,
    paddingTop: 2,
    paddingRight: 0,
    paddingBottom: 10,
    paddingLeft: 0,
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: {
      default: "transparent",
      ':is([aria-selected="true"])': "var(--console-accent)",
    },
    backgroundColor: "transparent",
    color: {
      default: "var(--console-text-faint)",
      ":hover": {
        default: "var(--console-text-dim)",
        ':is([aria-selected="true"])': "var(--console-text)",
      },
      ':is([aria-selected="true"])': "var(--console-text)",
    },
    cursor: "pointer",
    fontFamily: "var(--console-mono)",
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: ".2em",
    textTransform: "uppercase",
    transitionProperty: "color, border-color",
    transitionDuration: {
      default: ".2s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineOffset: -2,
    outlineColor: "var(--console-accent)",
  },
  count: {
    color: {
      default: "var(--console-text-muted)",
      [stylex.when.ancestor('[aria-selected="true"]')]:
        "var(--console-text-dim)",
    },
    fontSize: 10,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: ".04em",
  },
});
