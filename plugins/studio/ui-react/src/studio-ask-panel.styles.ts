import * as stylex from "@stylexjs/stylex";

const UI = "var(--console-ui)";
const DISPLAY = "var(--console-display)";

/** Ask, docked beside the editor: the same Chat, about the open entry. */
export const askStyles: Record<
  | "toggleHead"
  | "toggleBar"
  | "row"
  | "grow"
  | "panel"
  | "head"
  | "title"
  | "about"
  | "clear"
  | "close"
  | "who"
  | "whoSelect"
  | "thread"
  | "notice"
  | "starters"
  | "starter",
  stylex.StyleXStyles
> = stylex.create({
  // On a phone the head has no room; Ask moves to the bar below the writing.
  toggleHead: {
    display: { default: null, "@media (max-width: 640px)": "none" },
  },
  toggleBar: {
    display: { default: "none", "@media (max-width: 640px)": "inline-flex" },
    marginInlineStart: "auto",
  },
  row: { display: "flex", minWidth: 0, minHeight: 0, height: "100%" },
  grow: { display: "grid", flexGrow: 1, minWidth: 0, minHeight: 0 },
  panel: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: { default: 400, "@media (max-width: 900px)": "100%" },
    minHeight: 0,
    height: "100%",
    borderLeftWidth: { default: 1, "@media (max-width: 900px)": 0 },
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-rule)",
    backgroundColor: "var(--console-card-soft)",
    color: "var(--console-text)",
    fontFamily: UI,
    position: { default: "relative", "@media (max-width: 900px)": "fixed" },
    insetBlock: { default: null, "@media (max-width: 900px)": 0 },
    insetInline: { default: null, "@media (max-width: 900px)": 0 },
    // On a narrow screen Ask covers the page, Studio's bar included, so its
    // own head and close button stay in reach.
    zIndex: { default: null, "@media (max-width: 900px)": 60 },
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBlock: 12,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0 },
  about: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    paddingBlock: 2,
    paddingInline: 10,
    borderRadius: 999,
    fontSize: 12,
    color: "var(--console-accent-text)",
    backgroundColor: "var(--console-accent-soft)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  clear: {
    borderWidth: 0,
    borderStyle: "none",
    padding: 0,
    marginInlineStart: 2,
    background: "none",
    color: "inherit",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  },
  close: { marginInlineStart: "auto" },
  who: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 8,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  whoSelect: { maxWidth: 220 },
  thread: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: 12,
    paddingInline: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  notice: {
    margin: 0,
    fontSize: 13,
    color: "var(--console-text-muted)",
    fontFamily: DISPLAY,
  },
  starters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingInline: 16,
    paddingBlockStart: 8,
  },
  starter: {
    paddingBlock: 3,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 999,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text)",
    fontFamily: UI,
    fontSize: 12.5,
    cursor: "pointer",
  },
});
