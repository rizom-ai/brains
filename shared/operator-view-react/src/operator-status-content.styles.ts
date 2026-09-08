import * as stylex from "@stylexjs/stylex";

export const statusContentStyles: Record<
  | "good"
  | "warn"
  | "error"
  | "neutral"
  | "pill"
  | "softPill"
  | "goodSoft"
  | "lead"
  | "orbit"
  | "orbitInner"
  | "orbitCore"
  | "leadCopy"
  | "leadTitle"
  | "leadDescription"
  | "leadStatus"
  | "readiness"
  | "ring"
  | "ringGood"
  | "ringText"
  | "readinessTitle"
  | "readinessDescription"
  | "tags"
  | "tag"
  | "steps"
  | "step"
  | "stepFirst"
  | "stepLabel"
  | "stepDone"
  | "stepDot"
  | "stepDotDone"
  | "checks"
  | "checksHead"
  | "checkRow"
  | "checkHeading"
  | "checkCopy"
  | "checkName"
  | "checkDescription"
  | "checkUpdated"
  | "checkStatus"
  | "checkBody"
  | "checkHeaderCell",
  stylex.StyleXStyles
> = stylex.create({
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
  neutral: { color: "var(--console-text-faint)" },
  pill: {
    display: "inline-block",
    padding: "3px 9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, currentColor 36%, transparent)",
    borderRadius: 100,
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    maxWidth: "100%",
    overflowWrap: "anywhere",
  },
  softPill: {
    padding: "2px 8px",
    borderWidth: 0,
    fontSize: 8.5,
    letterSpacing: "0.08em",
    backgroundColor: "color-mix(in srgb, currentColor 13%, transparent)",
  },
  goodSoft: { backgroundColor: "var(--console-ok-soft)" },
  lead: {
    display: "grid",
    gridTemplateColumns: {
      default: "auto minmax(0,1fr) auto",
      "@media (max-width: 700px)": "auto minmax(0,1fr)",
      "@media (max-width: 420px)": "minmax(0,1fr)",
    },
    gap: 14,
    alignItems: "center",
    padding: "4px 0 17px",
  },
  orbit: {
    boxSizing: "border-box",
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: 42,
    height: 42,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, currentColor 30%, transparent)",
    borderRadius: "50%",
    backgroundColor: "color-mix(in srgb, currentColor 13%, transparent)",
  },
  orbitInner: {
    position: "absolute",
    inset: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "color-mix(in srgb, currentColor 24%, transparent)",
    borderRadius: "50%",
  },
  orbitCore: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "currentColor",
    boxShadow: "0 0 14px currentColor",
  },
  leadCopy: { minWidth: 0, overflowWrap: "anywhere" },
  leadTitle: {
    display: "block",
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: 20,
    fontVariationSettings: '"SOFT" 40',
    fontWeight: 520,
  },
  leadDescription: {
    margin: "2px 0 0",
    color: "var(--console-text-muted)",
    fontSize: 12.5,
  },
  leadStatus: {
    display: "flex",
    gridColumn: {
      default: null,
      "@media (max-width: 700px)": "2",
      "@media (max-width: 420px)": "1",
    },
    justifySelf: "start",
    minWidth: 0,
  },
  readiness: {
    display: "flex",
    alignItems: {
      default: "center",
      "@media (max-width: 420px)": "flex-start",
    },
    gap: 16,
    minHeight: 96,
    minWidth: 0,
  },
  ring: {
    display: "grid",
    flexShrink: 0,
    placeItems: "center",
    width: { default: 78, "@media (max-width: 420px)": 68 },
    height: { default: 78, "@media (max-width: 420px)": 68 },
    borderRadius: "50%",
    backgroundColor: "var(--console-rule-strong)",
  },
  ringGood: {
    backgroundColor: "var(--console-ok)",
    boxShadow: "0 0 28px color-mix(in srgb, var(--console-ok) 9%, transparent)",
  },
  ringText: {
    display: "grid",
    placeItems: "center",
    width: { default: 62, "@media (max-width: 420px)": 54 },
    height: { default: 62, "@media (max-width: 420px)": 54 },
    borderRadius: "50%",
    backgroundColor: "var(--console-card)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  readinessTitle: {
    color: "var(--console-text)",
    fontSize: 14,
    fontWeight: 500,
  },
  readinessDescription: {
    margin: "3px 0 0",
    color: "var(--console-text-muted)",
    fontSize: 12,
  },
  tags: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 11 },
  tag: {
    padding: "2px 6px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 2,
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    textTransform: "uppercase",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  steps: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    margin: "11px 0 0",
    padding: "12px 0 0",
    listStyle: "none",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8.5,
    textTransform: "uppercase",
  },
  step: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 7,
    "::before": {
      content: '""',
      flex: 1,
      minWidth: 8,
      height: 1,
      backgroundColor: "var(--console-rule-strong)",
    },
  },
  stepFirst: { flex: "0 1 auto", "::before": { display: "none" } },
  stepLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  stepDone: { color: "var(--console-text-muted)" },
  stepDot: {
    flexShrink: 0,
    width: 5,
    height: 5,
    borderRadius: "50%",
    backgroundColor: "var(--console-rule-strong)",
  },
  stepDotDone: { backgroundColor: "var(--console-ok)" },
  checks: {
    display: "block",
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  checksHead: {
    display: "block",
    position: { default: "static", "@media (max-width: 700px)": "absolute" },
    clipPath: { default: "none", "@media (max-width: 700px)": "inset(50%)" },
    width: { default: "auto", "@media (max-width: 700px)": 1 },
    height: { default: "auto", "@media (max-width: 700px)": 1 },
    overflow: "hidden",
  },
  checkBody: { display: "block" },
  checkHeaderCell: {
    textAlign: "left",
    padding: 0,
    minWidth: 0,
    fontWeight: 400,
    overflowWrap: "anywhere",
  },
  checkRow: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr) 72px 68px",
      "@media (max-width: 700px)": "minmax(0,1fr) fit-content(40%)",
    },
    gap: { default: 12, "@media (max-width: 700px)": "4px 12px" },
    alignItems: "center",
    padding: "9px 5px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
  },
  checkHeading: {
    padding: "2px 5px 7px",
    borderTopWidth: 0,
    color: "var(--console-text-faint)",
    fontFamily: "var(--console-mono)",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  checkCopy: {
    textAlign: "left",
    minWidth: 0,
    padding: 0,
    fontWeight: 400,
    gridColumn: "1",
    gridRow: "1",
    overflowWrap: "anywhere",
  },
  checkName: {
    display: "block",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: 10.5,
    fontWeight: 500,
  },
  checkDescription: {
    display: "block",
    marginTop: 2,
    color: "var(--console-text-faint)",
    fontSize: 10,
  },
  checkUpdated: {
    padding: 0,
    fontWeight: 400,
    minWidth: 0,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    gridColumn: { default: "2", "@media (max-width: 700px)": "1" },
    gridRow: { default: "1", "@media (max-width: 700px)": "2" },
    overflowWrap: "anywhere",
  },
  checkStatus: {
    padding: 0,
    fontWeight: 400,
    minWidth: 0,
    justifySelf: "start",
    gridColumn: { default: "3", "@media (max-width: 700px)": "2" },
    gridRow: "1",
  },
});
