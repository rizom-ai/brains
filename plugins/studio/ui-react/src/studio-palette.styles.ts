import * as stylex from "@stylexjs/stylex";

const UI = "var(--console-ui)";

/** ⌘K: one field, then what it finds, grouped. */
export const paletteStyles: Record<
  | "content"
  | "field"
  | "input"
  | "list"
  | "section"
  | "label"
  | "item"
  | "active"
  | "title"
  | "sub"
  | "kbd"
  | "empty",
  stylex.StyleXStyles
> = stylex.create({
  content: {
    boxSizing: "border-box",
    width: "min(640px, calc(100vw - 32px))",
    maxHeight: "min(560px, calc(100vh - 96px))",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: UI,
  },
  field: {
    paddingBlock: 12,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    borderWidth: 0,
    borderStyle: "none",
    outlineStyle: "none",
    backgroundColor: "transparent",
    color: "var(--console-text)",
    fontFamily: UI,
    fontSize: 16,
  },
  list: {
    overflowY: "auto",
    paddingBlock: 6,
    margin: 0,
  },
  section: { paddingBlock: 4 },
  label: {
    margin: 0,
    paddingBlock: 6,
    paddingInline: 16,
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    // Small type needs the full text color to read against the dialog.
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
  },
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    paddingBlock: 8,
    paddingInline: 16,
    color: "var(--console-text)",
    cursor: "pointer",
  },
  active: { backgroundColor: "var(--console-accent-soft)" },
  title: { fontSize: 14 },
  sub: { fontSize: 12, color: "var(--console-text-muted)" },
  kbd: {
    marginInlineStart: "auto",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text)",
  },
  empty: {
    margin: 0,
    paddingBlock: 16,
    paddingInline: 16,
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
});
