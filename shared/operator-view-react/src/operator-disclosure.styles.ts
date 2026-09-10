import * as stylex from "@stylexjs/stylex";

export const disclosureStyles: Record<
  "action" | "trigger" | "link",
  stylex.StyleXStyles
> = stylex.create({
  action: { width: "min(720px, 100%)", minWidth: 0 },
  link: {
    display: { default: "flex", "::-webkit-details-marker": "none" },
    alignItems: "center",
    listStyleType: "none",
    maxWidth: "100%",
    overflowWrap: "anywhere",
  },
  trigger: {
    display: { default: "block", "::-webkit-details-marker": "none" },
    width: "fit-content",
    maxWidth: "100%",
    boxSizing: "border-box",
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    padding: "7px 11px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-accent)",
    borderRadius: 6,
    backgroundColor: "var(--console-accent-soft)",
    color: "var(--console-accent)",
    cursor: "pointer",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    fontWeight: 400,
    lineHeight: "normal",
    letterSpacing: ".04em",
    listStyleType: "none",
    overflowWrap: "anywhere",
    marginBottom: { default: 0, ":is(details[open] > summary)": 14 },
    content: {
      default: null,
      "::before": { default: '"+"', ":is(details[open] > summary)": '"−"' },
    },
    marginRight: { default: null, "::before": 7 },
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: "solid",
    outlineColor: "var(--console-accent)",
    outlineOffset: -2,
  },
});
