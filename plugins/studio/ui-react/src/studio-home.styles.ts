import * as stylex from "@stylexjs/stylex";

const DISPLAY = "var(--console-display)";
const UI = "var(--console-ui)";

export const homeStyles: Record<
  | "page"
  | "date"
  | "sentence"
  | "composer"
  | "composerInput"
  | "composerBar"
  | "composerHint"
  | "composerNote"
  | "columns"
  | "bandHead"
  | "bandCount"
  | "attention"
  | "dot"
  | "dotError"
  | "dotWarn"
  | "dotInfo"
  | "attentionText"
  | "attentionTitle"
  | "attentionDetail"
  | "attentionAction"
  | "allClear"
  | "card"
  | "cardMeta"
  | "draftBadge"
  | "cardTitle"
  | "published"
  | "publishedTitle"
  | "publishedDate"
  | "status"
  | "statusDot"
  | "statusGood"
  | "statusWarn"
  | "statusError"
  | "statusText"
  | "link",
  stylex.StyleXStyles
> = stylex.create({
  page: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: 1040,
    paddingBlock: { default: 40, "@media (max-width: 640px)": 20 },
    paddingInline: { default: 52, "@media (max-width: 640px)": 16 },
    color: "var(--console-text)",
    fontFamily: UI,
  },
  date: { fontSize: 13, color: "var(--console-text-muted)", margin: 0 },
  sentence: {
    fontFamily: DISPLAY,
    fontWeight: 500,
    fontSize: { default: 34, "@media (max-width: 640px)": 26 },
    lineHeight: 1.15,
    letterSpacing: "-0.01em",
    maxWidth: 560,
    marginTop: 10,
    marginBottom: 24,
  },
  composer: {
    boxSizing: "border-box",
    maxWidth: 820,
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 14,
    backgroundColor: "var(--console-card)",
  },
  composerInput: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: 28,
    resize: "vertical",
    borderWidth: 0,
    borderStyle: "none",
    outlineStyle: "none",
    backgroundColor: "transparent",
    color: "var(--console-text)",
    fontFamily: DISPLAY,
    fontStyle: { default: "normal", ":placeholder-shown": "italic" },
    fontSize: 17,
    lineHeight: 1.5,
  },
  composerBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  composerHint: {
    marginLeft: "auto",
    fontSize: 11,
    color: "var(--console-text-dim)",
    display: { default: "inline", "@media (pointer: coarse)": "none" },
  },
  composerNote: {
    marginTop: 8,
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  columns: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1.15fr) minmax(0, 1fr)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    columnGap: 44,
    rowGap: 32,
    marginTop: 36,
  },
  bandHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    margin: 0,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    fontFamily: UI,
    fontSize: 13,
    fontWeight: 600,
  },
  bandCount: { fontWeight: 400, color: "var(--console-text-muted)" },
  attention: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    columnGap: 12,
    rowGap: 8,
    alignItems: "start",
    paddingBlock: 14,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
  },
  dot: {
    width: 9,
    height: 9,
    marginTop: 5,
    borderRadius: "50%",
    boxShadow: "0 0 0 3px var(--console-card-soft)",
  },
  dotError: { backgroundColor: "var(--console-err)" },
  dotWarn: { backgroundColor: "var(--console-accent)" },
  dotInfo: { backgroundColor: "var(--console-text-dim)" },
  attentionText: { minWidth: 0 },
  attentionTitle: { margin: 0, fontSize: 14, fontWeight: 600 },
  attentionDetail: {
    margin: 0,
    marginTop: 3,
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--console-text-muted)",
  },
  attentionAction: { alignSelf: "center" },
  allClear: {
    margin: 0,
    paddingBlock: 14,
    fontSize: 14,
    color: "var(--console-text-muted)",
  },
  card: {
    display: "block",
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 12,
    backgroundColor: "var(--console-card)",
    color: "inherit",
    textDecoration: "none",

    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineColor: "var(--console-accent)",
    outlineOffset: 2,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  draftBadge: {
    paddingBlock: 1,
    paddingInline: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-accent)",
    color: "var(--console-accent-text)",
    backgroundColor: "var(--console-accent-soft)",
    fontSize: 11,
  },
  cardTitle: {
    margin: 0,
    marginTop: 6,
    fontFamily: DISPLAY,
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.25,
  },
  published: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    paddingBlock: 11,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    color: "inherit",
    textDecoration: "none",
    ":hover": { color: "var(--console-accent-text)" },
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineColor: "var(--console-accent)",
    outlineOffset: 2,
  },
  publishedTitle: {
    flex: "1 1 auto",
    minWidth: 0,
    fontFamily: DISPLAY,
    fontSize: 15,
  },
  publishedDate: {
    flex: "0 0 auto",
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 40,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
    fontSize: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto" },
  statusGood: { backgroundColor: "var(--console-ok)" },
  statusWarn: { backgroundColor: "var(--console-warn)" },
  statusError: { backgroundColor: "var(--console-err)" },
  statusText: { flex: "1 1 auto", color: "var(--console-text-muted)" },
  link: {
    color: "var(--console-text)",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
    outlineWidth: { default: 0, ":focus-visible": 2 },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineColor: "var(--console-accent)",
    outlineOffset: 2,
  },
});
