import * as stylex from "@stylexjs/stylex";
export const recordStyles: Record<
  | "copy"
  | "title"
  | "compactTitle"
  | "editorial"
  | "attention"
  | "primaryAttention"
  | "activity"
  | "activityDescription"
  | "compactDescription"
  | "timestamp"
  | "clamped"
  | "description"
  | "metadata"
  | "compactMetadata"
  | "link"
  | "titleLink"
  | "quietLink"
  | "stretchedLink",
  stylex.StyleXStyles
> = stylex.create({
  copy: { minWidth: 0, flex: "1 1 0%" },
  title: {
    display: "block",
    fontFamily: "var(--console-ui)",
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 0,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  compactTitle: {
    fontFamily: "var(--console-display)",
    fontWeight: 520,
    letterSpacing: "-0.005em",
  },
  editorial: {
    fontFamily: "var(--console-display)",
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 1.35,
    letterSpacing: "-0.15px",
  },
  attention: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    letterSpacing: "-0.15px",
  },
  primaryAttention: { fontWeight: 700 },
  activity: { fontSize: 14, fontWeight: 500, lineHeight: 1.45 },
  activityDescription: { lineHeight: 1.6 },
  compactDescription: { fontSize: 12.5, lineHeight: 1.5 },
  timestamp: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.6,
    fontVariantNumeric: "tabular-nums lining-nums",
    letterSpacing: "-0.15px",
  },
  clamped: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },
  description: {
    margin: "5px 0 0",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.7,
    color: "var(--console-text-dim)",
    overflowWrap: "anywhere",
  },
  metadata: {
    display: "block",
    marginTop: 8,
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  compactMetadata: { fontFamily: "var(--console-mono)", fontSize: 10.5 },
  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "var(--console-accent)",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    textAlign: "inherit",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: 3,
    cursor: "pointer",
    overflowWrap: "anywhere",
    outlineOffset: 4,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: "var(--console-accent)",
  },
  stretchedLink: {
    position: "static",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      cursor: "pointer",
    },
  },
  titleLink: {
    color: { default: "inherit", ":hover": "var(--console-accent-dim)" },
  },
  quietLink: {
    color: {
      default: "var(--console-text-dim)",
      ":hover": "var(--console-accent-dim)",
    },
  },
});
