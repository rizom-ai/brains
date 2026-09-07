import * as stylex from "@stylexjs/stylex";
export const summaryListStyles: Record<
  | "list"
  | "item"
  | "copy"
  | "heading"
  | "description"
  | "metadata"
  | "separator"
  | "tags"
  | "tag"
  | "trailing",
  stylex.StyleXStyles
> = stylex.create({
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: { default: "flex", ":is([hidden])": "none" },
    flexDirection: "column",
    minWidth: 0,
  },
  item: {
    display: { default: "grid", ":is([hidden])": "none" },
    gridTemplateColumns: "minmax(0,1fr) fit-content(40%)",
    gap: { default: 16, "@media (max-width: 640px)": 10 },
    alignItems: "baseline",
    paddingTop: { default: 12, "@media (max-width: 640px)": 10 },
    paddingBottom: { default: 12, "@media (max-width: 640px)": 10 },
    paddingLeft: 4,
    paddingRight: 4,
    minWidth: 0,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-accent-soft)",
    },
    transitionProperty: "background-color",
    transitionDuration: {
      default: ".15s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: "ease",
  },
  copy: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  heading: {
    fontFamily: "var(--console-ui)",
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "var(--console-text)",
    whiteSpace: { default: "nowrap", "@media (max-width: 640px)": "normal" },
    overflow: "hidden",
    textOverflow: "ellipsis",
    overflowWrap: "anywhere",
  },
  description: {
    fontSize: 12,
    color: "var(--console-text-dim)",
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  },
  metadata: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    letterSpacing: ".04em",
    color: "var(--console-text-muted)",
    marginTop: 3,
    fontVariantNumeric: "tabular-nums",
    overflowWrap: "anywhere",
  },
  separator: {
    color: "var(--console-text-faint)",
    marginLeft: 6,
    marginRight: 6,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
    minWidth: 0,
  },
  tag: {
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".1em",
    textTransform: "lowercase",
    color: "var(--console-text-muted)",
    padding: "2px 7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 100,
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflowWrap: "anywhere",
  },
  trailing: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    overflowWrap: "anywhere",
    alignSelf: { default: "auto", "@media (max-width: 640px)": "start" },
  },
});
