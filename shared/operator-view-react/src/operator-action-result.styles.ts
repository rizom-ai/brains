import * as stylex from "@stylexjs/stylex";

export const actionResultStyles: Record<
  "frame" | "title" | "list" | "row" | "term" | "value" | "code" | "copy",
  stylex.StyleXStyles
> = stylex.create({
  frame: {
    display: "grid",
    gap: 8,
    width: "min(720px, 100%)",
    minWidth: 0,
    boxSizing: "border-box",
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-accent)",
    borderRadius: 8,
    backgroundColor: "var(--console-accent-soft)",
    "@media (min-width: 641px)": {
      position: {
        default: "static",
        ":is([data-operator-action-popover] *)": "absolute",
      },
      top: {
        default: null,
        ":is([data-operator-action-popover] *)": "calc(100% + 10px)",
      },
      right: { default: null, ":is([data-operator-action-popover] *)": 0 },
      zIndex: { default: null, ":is([data-operator-action-popover] *)": 10 },
      width: {
        default: "min(720px, 100%)",
        ":is([data-operator-action-popover] *)":
          "min(720px, calc(100vw - 80px))",
      },
      padding: { default: 12, ":is([data-operator-action-popover] *)": 16 },
      borderColor: {
        default: "var(--console-rule-accent)",
        ":is([data-operator-action-popover] *)": "var(--console-rule-strong)",
      },
      borderRadius: { default: 8, ":is([data-operator-action-popover] *)": 9 },
      backgroundColor: {
        default: "var(--console-accent-soft)",
        ":is([data-operator-action-popover] *)": "var(--console-card)",
      },
      boxShadow: {
        default: null,
        ":is([data-operator-action-popover] *)":
          "0 20px 50px -24px color-mix(in srgb, var(--console-text) 55%, transparent)",
      },
    },
  },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  list: { display: "grid", gap: 7, margin: 0, minWidth: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: {
      default: "130px minmax(0, 1fr)",
      "@media (max-width: 640px)": "minmax(0, 1fr)",
    },
    gap: { default: 10, "@media (max-width: 640px)": 3 },
    alignItems: "center",
    minWidth: 0,
  },
  term: {
    color: "var(--console-text-muted)",
    fontSize: 9,
    fontFamily: "var(--console-mono)",
    fontWeight: 400,
    lineHeight: "normal",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  value: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    margin: 0,
  },
  code: {
    overflow: "hidden",
    minWidth: 0,
    color: "var(--console-text)",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copy: {
    flexShrink: 0,
    minHeight: { default: null, "@media (max-width: 640px)": 44 },
    minWidth: { default: null, "@media (max-width: 640px)": 44 },
  },
});
