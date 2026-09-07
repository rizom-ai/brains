import * as stylex from "@stylexjs/stylex";
export const noticeStyles: Record<
  | "root"
  | "copy"
  | "actions"
  | "comfortable"
  | "compact"
  | "title"
  | "compactTitle"
  | "text"
  | "compactText"
  | "afterTitle"
  | "neutral"
  | "good"
  | "warn"
  | "error",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 22,
    paddingBlock: 3,
    paddingLeft: 20,
    paddingRight: 0,
    "@media (max-width: 640px)": {
      alignItems: "start",
      flexWrap: "wrap",
      gap: 12,
      paddingLeft: 14,
    },
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
  },
  copy: { minWidth: 0 },
  actions: { flexShrink: 0, maxWidth: "100%" },
  comfortable: { backgroundColor: "transparent" },
  compact: { display: "block", paddingBlock: 11, paddingInline: 14 },
  neutral: {
    borderLeftColor: "var(--console-text-muted)",
    backgroundColor: "color-mix(in srgb,var(--console-text) 4%,transparent)",
  },
  good: {
    borderLeftColor: "var(--console-ok)",
    backgroundColor: "var(--console-ok-soft)",
  },
  warn: {
    borderLeftColor: "var(--console-warn)",
    backgroundColor: "color-mix(in srgb,var(--console-warn) 7%,transparent)",
  },
  error: {
    borderLeftColor: "var(--console-err)",
    backgroundColor: "color-mix(in srgb,var(--console-err) 7%,transparent)",
  },
  title: {
    display: "block",
    fontFamily: "var(--console-ui)",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    letterSpacing: "-0.15px",
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  compactTitle: { fontSize: 13, fontWeight: 550 },
  text: {
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.7,
    color: "var(--console-text-dim)",
    whiteSpace: "pre-line",
    overflowWrap: "anywhere",
  },
  compactText: { fontSize: 12.5, lineHeight: 1.5 },
  afterTitle: { marginTop: 9 },
});
