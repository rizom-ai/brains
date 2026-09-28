import * as stylex from "@stylexjs/stylex";
export const groupingSharedStyles: Record<
  "checkbox" | "marker" | "section" | "head" | "title",
  stylex.StyleXStyles
> = stylex.create({
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
});
