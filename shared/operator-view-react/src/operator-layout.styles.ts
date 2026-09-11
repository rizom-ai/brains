import * as stylex from "@stylexjs/stylex";
export const layoutStyles: Record<
  | "card"
  | "labeledDisclosure"
  | "disclosureHeading"
  | "compactCard"
  | "feature"
  | "featureHeading"
  | "heading"
  | "headingLabel"
  | "headingMetadata"
  | "compactHeading"
  | "summary"
  | "disclosure"
  | "comfortableSummary"
  | "attentionSummary"
  | "attentionMetadata"
  | "body"
  | "disclosedBody"
  | "warn"
  | "error"
  | "good"
  | "columns"
  | "compactColumns"
  | "region"
  | "joinedRegion"
  | "compactAside"
  | "asideRegion",
  stylex.StyleXStyles
> = stylex.create({
  card: { minWidth: 0 },
  labeledDisclosure: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr) auto",
      ":has(> details[open])": "minmax(0,1fr)",
      "@media (max-width: 640px)": "minmax(0,1fr)",
    },
    alignItems: "center",
    gap: 16,
  },
  disclosureHeading: {
    display: "block",
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginBottom: 0,
    letterSpacing: 0,
    textTransform: "none",
  },
  compactCard: {
    padding: "15px 16px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "var(--console-card)",
  },
  feature: {
    padding: { default: 24, "@media (max-width: 640px)": 18 },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    backgroundColor: "var(--console-card)",
  },
  featureHeading: {
    fontFamily: "var(--console-display)",
    fontSize: 28,
    fontWeight: 500,
    fontVariationSettings: '"SOFT" 70,"opsz" 40',
    lineHeight: 1.3,
    letterSpacing: 0,
    textTransform: "none",
    marginBottom: 16,
    paddingBottom: 0,
    borderBottomWidth: 0,
    color: "var(--console-text)",
  },
  headingLabel: {
    margin: 0,
    minWidth: 0,
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    overflowWrap: "anywhere",
  },
  headingMetadata: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.6,
    textTransform: "none",
    letterSpacing: 0,
    overflowWrap: "anywhere",
  },
  heading: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    margin: 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.35,
    color: "var(--console-text)",
  },
  compactHeading: {
    marginBottom: 10,
    paddingBottom: 0,
    borderBottomWidth: 0,
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--console-text-muted)",
  },
  summary: {
    cursor: "pointer",
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--console-text-dim)",
    outlineOffset: 4,
    overflowWrap: "anywhere",
  },
  disclosure: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    paddingBottom: { default: 0, ":is([open])": 16 },
  },
  comfortableSummary: {
    boxSizing: "border-box",
    minHeight: 48,
    padding: "16px 0",
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  attentionSummary: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "var(--console-text)",
  },
  attentionMetadata: { display: "block", marginTop: 8 },
  body: { display: "grid", gap: 16, minWidth: 0 },
  disclosedBody: { paddingTop: 16 },
  warn: {
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-warn)",
    paddingLeft: 16,
  },
  error: {
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-err)",
    paddingLeft: 16,
  },
  good: {
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--console-ok)",
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.45fr) minmax(220px,1fr)",
    alignItems: "start",
    gap: 36,
    "@media (max-width: 900px)": {
      gridTemplateColumns: "minmax(0,1fr)",
      gap: 32,
    },
  },
  compactColumns: {
    gridTemplateColumns: {
      default: "minmax(0,1.5fr) minmax(250px,0.6fr)",
      "@media (max-width: 900px)": "minmax(0,1fr)",
    },
    gap: 30,
  },
  region: { display: "grid", alignContent: "start", gap: 26, minWidth: 0 },
  joinedRegion: { gap: 0 },
  compactAside: { gap: 15 },
  asideRegion: {
    containerName: "operator-aside",
    containerType: "inline-size",
  },
});
