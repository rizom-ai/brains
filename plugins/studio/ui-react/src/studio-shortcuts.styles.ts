import * as stylex from "@stylexjs/stylex";

export const shortcutStyles: Record<
  "list" | "keys" | "row" | "action",
  stylex.StyleXStyles
> = stylex.create({
  list: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "8px 18px",
    margin: 0,
  },
  keys: {
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  // Each pair is one row of the grid.
  row: { display: "contents" },
  action: { margin: 0 },
});
