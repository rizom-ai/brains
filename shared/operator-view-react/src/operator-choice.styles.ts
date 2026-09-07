import * as stylex from "@stylexjs/stylex";

export const choiceStyles: Record<
  | "group"
  | "compactGroup"
  | "button"
  | "compactButton"
  | "label"
  | "count"
  | "attention"
  | "tools"
  | "search"
  | "toggle"
  | "focus",
  stylex.StyleXStyles
> = stylex.create({
  group: {
    display: { default: "flex", ":is([hidden])": "none" },
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
    minWidth: 0,
  },
  compactGroup: { marginBottom: 12 },
  button: {
    display: { default: "inline-flex", ":is([hidden])": "none" },
    alignItems: "center",
    gap: 6,
    paddingTop: 5,
    paddingRight: 10,
    paddingBottom: 5,
    paddingLeft: 10,
    minWidth: 0,
    maxWidth: "100%",
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--console-rule-strong)",
      ":hover": "var(--console-rule-accent)",
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "var(--console-rule-accent)",
    },
    borderRadius: 100,
    backgroundColor: {
      default: "transparent",
      ":hover": {
        default: "var(--console-accent-soft)",
        ':is([aria-selected="true"],[aria-pressed="true"])':
          "color-mix(in srgb, var(--console-card-soft) 55%, transparent)",
      },
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "color-mix(in srgb, var(--console-card-soft) 55%, transparent)",
    },
    color: {
      default: "var(--console-text-faint)",
      ":hover": "var(--console-text)",
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "var(--console-text)",
    },
    cursor: "pointer",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    transitionProperty: "background-color, border-color, color",
    transitionDuration: {
      default: ".15s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease",
  },
  compactButton: { paddingLeft: 8, paddingRight: 8 },
  label: {
    minWidth: 0,
    overflowWrap: "anywhere",
    color: {
      default: "var(--console-text-muted)",
      [stylex.when.ancestor(
        ':is([aria-selected="true"],[aria-pressed="true"])',
      )]: "var(--console-text-dim)",
    },
  },
  count: {
    color: "var(--console-text)",
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  },
  attention: { color: "var(--console-warn)" },
  tools: {
    display: { default: "flex", ":is([hidden])": "none" },
    alignItems: { default: "center", "@media (max-width: 640px)": "stretch" },
    flexDirection: { default: "row", "@media (max-width: 640px)": "column" },
    gap: 10,
    marginBottom: 10,
    minWidth: 0,
  },
  search: {
    width: { default: "min(100%, 280px)", "@media (max-width: 640px)": "100%" },
    minWidth: 0,
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    boxSizing: "border-box",
    padding: "7px 10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--console-rule-strong)",
      ":focus-visible": "var(--console-rule-accent)",
    },
    borderRadius: 4,
    backgroundColor:
      "color-mix(in srgb, var(--console-card-soft) 45%, transparent)",
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    "::placeholder": { color: "var(--console-text-faint)" },
  },
  toggle: {
    padding: "6px 0",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: {
      default: "var(--console-text-muted)",
      ":hover": "var(--console-text)",
    },
    cursor: "pointer",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    alignSelf: { default: "auto", "@media (max-width: 640px)": "start" },
  },
  focus: {
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineOffset: -2,
    outlineColor: "var(--console-accent)",
  },
});
