import * as stylex from "@stylexjs/stylex";

export const segmentedStyles: Record<
  "group" | "button" | "attention",
  stylex.StyleXStyles
> = stylex.create({
  group: {
    display: { default: "inline-flex", ":is([hidden])": "none" },
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
    marginBottom: 14,
    padding: 3,
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "color-mix(in srgb, var(--console-card) 62%, transparent)",
  },
  attention: {
    color: {
      default: "var(--console-warn)",
      ":hover": {
        default: "var(--console-warn)",
        ':is([aria-selected="true"],[aria-pressed="true"])':
          "var(--console-warn)",
      },
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "var(--console-warn)",
    },
  },
  button: {
    minHeight: { default: 28, "@media (max-width: 640px)": 44 },
    minWidth: 0,
    maxWidth: "100%",
    padding: "0 13px",
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: {
      default: "transparent",
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "var(--console-text)",
    },
    color: {
      default: "var(--console-text-muted)",
      ":hover": {
        default: "var(--console-text)",
        ':is([aria-selected="true"],[aria-pressed="true"])':
          "var(--console-frame)",
      },
      ':is([aria-selected="true"],[aria-pressed="true"])':
        "var(--console-frame)",
    },
    fontWeight: {
      default: 400,
      ':is([aria-selected="true"],[aria-pressed="true"])': 500,
    },
    cursor: "pointer",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: "solid",
    outlineColor: "var(--console-accent)",
    outlineOffset: -2,
    display: { default: "inline-block", ":is([hidden])": "none" },
  },
});
