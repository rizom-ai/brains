import * as stylex from "@stylexjs/stylex";
export const vocabularyStyles: Record<
  | "choices"
  | "choice"
  | "checkbox"
  | "marker"
  | "section"
  | "head"
  | "title"
  | "values",
  stylex.StyleXStyles
> = stylex.create({
  choices: {
    display: "grid",
    gap: 6,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    minWidth: 0,
  },
  choice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 36,
    overflowWrap: "anywhere",
  },
  checkbox: {
    width: 18,
    height: 18,
    flexShrink: 0,
    accentColor: "var(--console-accent)",
  },
  marker: {
    display: "inline-block",
    marginInlineStart: 8,
    padding: "2px 5px",
    border: "1px solid var(--console-accent)",
    color: "var(--console-accent)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    fontWeight: 400,
    whiteSpace: "nowrap",
  },
  section: {
    borderTop: "1px solid var(--console-rule-strong)",
    padding: "22px 0",
    minWidth: 0,
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 16,
  },
  title: {
    fontFamily: "var(--console-display)",
    fontSize: 22,
    margin: 0,
    fontWeight: 500,
  },
  values: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    margin: "12px 0",
    padding: 0,
    listStyle: "none",
  },
});
