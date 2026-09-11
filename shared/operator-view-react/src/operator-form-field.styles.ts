import * as stylex from "@stylexjs/stylex";

export const formFieldStyles: Record<
  "label" | "control" | "checkboxLabel" | "checkbox",
  stylex.StyleXStyles
> = stylex.create({
  label: {
    display: "grid",
    gap: 5,
    minWidth: 0,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    overflowWrap: "anywhere",
  },
  control: {
    minHeight: { default: 38, "@media (max-width: 640px)": 44 },
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 7,
    backgroundColor: "var(--console-card-soft)",
    color: "var(--console-text)",
    padding: "8px 10px",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: "solid",
    outlineColor: "var(--console-accent)",
    outlineOffset: -2,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
  },
  checkbox: {
    minHeight: { default: "auto", "@media (max-width: 640px)": "auto" },
    flexShrink: 0,
  },
});
