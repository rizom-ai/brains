import * as stylex from "@stylexjs/stylex";

export const actionLinkStyles: Record<
  "group" | "link" | "primary" | "label" | "indicator",
  stylex.StyleXStyles
> = stylex.create({
  group: {
    display: { default: "flex", ":is([hidden])": "none" },
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  link: {
    display: { default: "inline-flex", ":is([hidden])": "none" },
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    boxSizing: "border-box",
    minWidth: 0,
    maxWidth: "100%",
    minHeight: { default: 36, "@media (max-width: 640px)": 44 },
    padding: "8px 11px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--console-rule-strong)",
      ":hover": "var(--console-rule-accent)",
    },
    borderRadius: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-accent-soft)",
    },
    color: {
      default: "var(--console-text-dim)",
      ":hover": "var(--console-accent)",
    },
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".04em",
    textDecoration: "none",
    transitionProperty: "border-color, background-color, color",
    transitionDuration: {
      default: ".15s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: "var(--console-accent)",
    outlineOffset: -2,
  },
  primary: {
    borderColor: "var(--console-rule-accent)",
    backgroundColor: "var(--console-accent-soft)",
    color: "var(--console-accent)",
  },
  label: { minWidth: 0, overflowWrap: "anywhere" },
  indicator: {
    flexShrink: 0,
    color: "var(--console-accent)",
    transform: {
      default: "none",
      [stylex.when.ancestor(":hover")]: "translate(2px, -1px)",
    },
    transitionProperty: "transform",
    transitionDuration: {
      default: ".15s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease",
  },
});
