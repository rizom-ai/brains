import * as stylex from "@stylexjs/stylex";

export const formFieldStyles: Record<
  "label" | "wideLabel" | "control" | "textarea" | "checkboxLabel" | "checkbox",
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
  // Longer text spans the form row instead of sharing it.
  wideLabel: { gridColumn: "1 / -1" },
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
  textarea: { minHeight: 88, resize: "vertical", lineHeight: 1.45 },
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
