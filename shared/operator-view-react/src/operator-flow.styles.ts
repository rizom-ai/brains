import * as stylex from "@stylexjs/stylex";

export const flowStyles: Record<
  "root" | "track" | "step" | "mark" | "label" | "detail",
  stylex.StyleXStyles
> & {
  // Caption slots accept CSS variable expressions, including enum-valued properties.
  heading: stylex.StyleXStyles<Record<string, string | number | null>>;
} = stylex.create({
  root: { minWidth: 0, maxWidth: "100%" },
  heading: {
    display: { default: "block", ":is([data-operator-card-body] *)": "none" },
    margin: "0 0 11px",
    color: "var(--console-text-muted)",
    fontSize: "var(--operator-section-size, 9.5px)",
    fontWeight: "var(--operator-section-weight, 500)",
    letterSpacing: "var(--operator-section-spacing, .16em)",
    textTransform: "var(--operator-section-transform, uppercase)",
    fontFamily: "var(--operator-section-family, var(--console-mono))",
    overflowWrap: "anywhere",
  },
  track: {
    display: { default: "flex", "@media (max-width: 640px)": "grid" },
    gap: { default: 0, "@media (max-width: 640px)": 10 },
    margin: 0,
    // Keep the active station's 3px halo inside the scrolling viewport.
    padding: 3,
    listStyleType: "none",
    overflowX: { default: "auto", "@media (max-width: 640px)": "visible" },
    maxWidth: "100%",
  },
  step: {
    position: { default: "relative", "::after": "absolute" },
    boxSizing: "border-box",
    flexShrink: 0,
    minWidth: 0,
    width: {
      default: "8.5rem",
      "@media (max-width: 640px)": "auto",
      "::after": { default: null, "@media (max-width: 640px)": 1 },
    },
    paddingRight: { default: 20, "@media (max-width: 640px)": 0 },
    paddingLeft: { default: 0, "@media (max-width: 640px)": 24 },
    paddingBottom: { default: 0, "@media (max-width: 640px)": 8 },
    color: "var(--console-text-muted)",
    content: {
      default: null,
      "::after": { default: '""', ":last-child": "none" },
    },
    top: {
      default: null,
      "::after": { default: 5, "@media (max-width: 640px)": 14 },
    },
    left: {
      default: null,
      "::after": { default: 14, "@media (max-width: 640px)": 4 },
    },
    right: {
      default: null,
      "::after": { default: 12, "@media (max-width: 640px)": "auto" },
    },
    bottom: {
      default: null,
      "::after": { default: null, "@media (max-width: 640px)": -5 },
    },
    height: {
      default: null,
      "::after": { default: 1, "@media (max-width: 640px)": "auto" },
    },
    backgroundColor: { default: null, "::after": "var(--console-rule-strong)" },
  },
  mark: {
    position: { default: "static", "@media (max-width: 640px)": "absolute" },
    top: { default: null, "@media (max-width: 640px)": 4 },
    left: { default: null, "@media (max-width: 640px)": 0 },
    display: "block",
    boxSizing: "border-box",
    width: 9,
    height: 9,
    marginBottom: 9,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: "50%",
    borderColor: {
      default: "var(--console-text-muted)",
      ":is([data-status=active] > *, [data-status=complete] > *)":
        "var(--console-accent)",
      ":is([data-status=failed] > *)": "var(--console-err)",
    },
    backgroundColor: {
      default: "var(--console-frame)",
      ":is([data-status=active] > *, [data-status=complete] > *)":
        "var(--console-accent)",
      ":is([data-status=failed] > *)": "var(--console-err)",
    },
    boxShadow: {
      default: "none",
      ":is([data-status=active] > *)": "0 0 0 3px var(--console-accent-soft)",
    },
  },
  label: {
    display: "block",
    fontSize: 12.5,
    fontWeight: 500,
    overflowWrap: "anywhere",
    color: {
      default: "var(--console-text-dim)",
      ":is([data-status=active] > *, [data-status=complete] > *)":
        "var(--console-text)",
      ":is([data-status=failed] > *)": "var(--console-err)",
    },
  },
  detail: {
    display: "block",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    overflowWrap: "anywhere",
  },
});
