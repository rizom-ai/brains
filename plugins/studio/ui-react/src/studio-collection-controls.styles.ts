import * as stylex from "@stylexjs/stylex";
export const collectionControlStyles: Record<
  "controls" | "search" | "searchLabel" | "input" | "summary" | "fields",
  stylex.StyleXStyles
> = stylex.create({
  controls: {
    paddingBlock: 16,
    borderBottom: "1px solid var(--console-rule)",
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
  search: { display: "flex", alignItems: "end", gap: 12 },
  searchLabel: { display: "grid", gap: 6, flex: 1, minWidth: 0 },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    padding: "8px 10px",
    border: "1px solid var(--console-rule)",
    borderRadius: 5,
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    color: "var(--console-text)",
    backgroundColor: "var(--console-card)",
  },
  summary: { paddingBlock: 12, cursor: "pointer", minHeight: 44 },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    paddingBottom: 12,
  },
});
