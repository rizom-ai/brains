import * as stylex from "@stylexjs/stylex";

const WIDE_INSET = 36;
const PHONE_INLINE_INSET = 20;
const PHONE_TOP_INSET = 24;
export const headStyles: Record<
  | "root"
  | "inset"
  | "documentInset"
  | "row"
  | "hasAction"
  | "copy"
  | "title"
  | "metadata"
  | "phoneHidden"
  | "statusDetail"
  | "totals"
  | "total"
  | "totalLabel"
  | "totalValue"
  | "action"
  | "navigation"
  | "good"
  | "warn"
  | "error",
  stylex.StyleXStyles
> = stylex.create({
  inset: {
    paddingTop: WIDE_INSET,
    paddingInline: WIDE_INSET,
    "@media (max-width: 640px)": {
      paddingTop: PHONE_TOP_INSET,
      paddingInline: PHONE_INLINE_INSET,
    },
  },
  documentInset: {
    marginTop: WIDE_INSET,
    marginInline: WIDE_INSET,
    "@media (max-width: 640px)": {
      marginTop: PHONE_TOP_INSET,
      marginInline: PHONE_INLINE_INSET,
    },
  },
  root: {
    display: "grid",
    gap: 8,
    margin: 0,
    paddingBottom: 18,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-text)",
    "@media (max-width: 640px)": { paddingBottom: 16 },
  },
  navigation: { gridColumn: "1 / -1" },
  hasAction: { gridTemplateColumns: "minmax(0, 1fr) auto" },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "baseline",
    gap: 12,
    minWidth: 0,
  },
  copy: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 12,
    minWidth: 0,
  },
  title: {
    minWidth: 0,
    maxWidth: "100%",
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: 36,
    fontVariationSettings: '"SOFT" 70,"opsz" 60',
    fontWeight: 600,
    letterSpacing: "-0.025em",
    lineHeight: 1.1,
    overflowWrap: "anywhere",
    "@media (max-width: 640px)": {
      fontSize: 29,
      letterSpacing: "0.015em",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
      overflow: "hidden",
    },
  },
  metadata: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    color: "var(--console-text-muted)",
    fontSize: 11.5,
    "@media (max-width: 640px)": { fontSize: 10.5 },
  },
  phoneHidden: {
    minWidth: 0,
    "@media (max-width: 640px)": { display: "none" },
  },
  statusDetail: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-ui)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  totals: { display: "flex", flexWrap: "wrap", gap: 12, margin: 0 },
  total: { display: "inline-flex", alignItems: "baseline", gap: 5 },
  totalLabel: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-ui)",
    fontSize: 11,
  },
  totalValue: {
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    fontWeight: 600,
  },
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  action: {
    position: "relative",
    zIndex: 4,
    marginLeft: "auto",
    maxWidth: "100%",
    flexShrink: 0,
    "@media (max-width: 640px)": {
      maxHeight: {
        default: null,
        ":has([data-operator-action-result])": "calc(100dvh - 124px)",
      },
      overflowY: {
        default: null,
        ":has([data-operator-action-result])": "auto",
      },
      padding: { default: null, ":has([data-operator-action-result])": 12 },
      border: {
        default: null,
        ":has([data-operator-action-result])":
          "1px solid var(--console-rule-strong)",
      },
      backgroundColor: {
        default: null,
        ":has([data-operator-action-result])":
          "color-mix(in srgb, var(--console-card) 96%, transparent)",
      },
      boxShadow: {
        default: null,
        ":has([data-operator-action-result])":
          "0 18px 48px -18px color-mix(in srgb, var(--console-text) 55%, transparent)",
      },
    },
  },
});
