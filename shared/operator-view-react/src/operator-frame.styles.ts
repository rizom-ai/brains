import * as stylex from "@stylexjs/stylex";

export const frameStyles: Record<
  | "page"
  | "frame"
  | "canvas"
  | "sections"
  | "section"
  | "sectionHeading"
  | "sectionTitle"
  | "footer"
  | "footerMark"
  | "footerActions"
  | "footerLink",
  stylex.StyleXStyles
> = stylex.create({
  page: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    margin: "0 auto",
    padding: {
      default: "clamp(24px, 4vw, 48px) 0 60px",
      "@media (max-width: 640px)": "12px 0 40px",
    },
  },
  frame: {
    width: "min(1280px, 96vw)",
    minHeight: 560,
    margin: "0 auto",
    backgroundColor: "var(--console-frame)",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderLeftWidth: { default: 1, "@media (max-width: 640px)": 0 },
    borderRightWidth: { default: 1, "@media (max-width: 640px)": 0 },
    borderRadius: { default: 10, "@media (max-width: 640px)": 0 },
    overflow: "hidden",
    boxShadow: {
      default: "0 30px 70px -30px rgba(0, 0, 0, 0.8)",
      ':is([data-climate="paper"] *)':
        "0 22px 40px -28px rgba(90, 60, 20, 0.28)",
      "@media (max-width: 640px)": {
        default: "none",
        ':is([data-climate="paper"] *)': "none",
      },
    },
  },
  canvas: { padding: { default: 26, "@media (max-width: 640px)": 14 } },
  sections: {
    display: "grid",
    gap: { default: 42, "@media (max-width: 640px)": 24 },
  },
  section: {
    display: { default: "block", ":is([hidden])": "none" },
    minWidth: 0,
  },
  sectionHeading: {
    display: { default: "block", ":is([data-ui-tabs-active] *)": "none" },
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  sectionTitle: {
    minWidth: 0,
    overflowWrap: "anywhere",
    margin: 0,
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 40',
    fontWeight: 520,
    fontSize: 22,
    color: "var(--console-text)",
  },
  footer: {
    minWidth: 0,
    marginTop: 32,
    padding: {
      default: "18px 26px 60px",
      "@media (max-width: 640px)": "14px 14px 30px",
    },
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    backgroundColor: "var(--console-card-soft)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: {
      default: "baseline",
      "@media (max-width: 700px)": "flex-start",
    },
    flexDirection: { default: "row", "@media (max-width: 700px)": "column" },
    gap: 18,
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--console-text-faint)",
  },
  footerMark: { minWidth: 0, overflowWrap: "anywhere" },
  footerActions: {
    display: "inline-flex",
    flexWrap: "wrap",
    minWidth: 0,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    gap: 16,
    justifyContent: {
      default: "flex-end",
      "@media (max-width: 700px)": "flex-start",
    },
  },
  footerLink: {
    color: {
      default: "var(--console-text-muted)",
      ":hover": "var(--console-accent)",
    },
    backgroundColor: "transparent",
    borderWidth: 0,
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    cursor: "pointer",
    padding: 0,
    textDecorationLine: "none",
    overflowWrap: "anywhere",
    display: { default: null, "@media (max-width: 640px)": "inline-flex" },
    alignItems: { default: null, "@media (max-width: 640px)": "center" },
    minHeight: { default: null, "@media (max-width: 640px)": 44 },
    ":focus-visible": {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: "var(--console-accent)",
      outlineOffset: 3,
    },
  },
});
