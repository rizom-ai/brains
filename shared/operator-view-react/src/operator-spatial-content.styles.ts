import * as stylex from "@stylexjs/stylex";
export const spatialContentStyles: Record<
  | "point"
  | "dot"
  | "pointLabel"
  | "description"
  | "legend"
  | "legendItem"
  | "detail"
  | "detailText",
  stylex.StyleXStyles
> & {
  detailTitle: stylex.StyleXStyles<Record<string, string | number | null>>;
} = stylex.create({
  point: {
    position: "absolute",
    zIndex: {
      default: 3,
      ":hover": 4,
      ":focus-visible": 4,
      ':is([aria-pressed="true"], [data-ui-spatial-related-active])': 4,
    },
    display: "grid",
    gridTemplateColumns: "auto minmax(0, auto)",
    gap: 5,
    alignItems: "center",
    maxWidth: 150,
    padding: "3px 6px",
    borderWidth: 0,
    backgroundColor: "color-mix(in srgb, var(--console-card) 88%, transparent)",
    color: {
      default: "var(--console-text-dim)",
      ":hover": "var(--console-accent)",
      ":focus-visible": "var(--console-accent)",
      ':is([aria-pressed="true"], [data-ui-spatial-related-active])':
        "var(--console-accent)",
    },
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    lineHeight: 1.2,
    textAlign: "left",
    transform: "translate(-50%, -50%)",
    cursor: "pointer",
    transitionProperty: {
      default: "opacity, color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: "120ms",
    transitionTimingFunction: "ease",
    outlineWidth: {
      default: 0,
      ":hover": 1,
      ":focus-visible": 1,
      ':is([aria-pressed="true"], [data-ui-spatial-related-active])': 1,
    },
    outlineStyle: "solid",
    outlineColor: "var(--console-rule-accent)",
    outlineOffset: 2,
    opacity: {
      default: 1,
      ':is([data-ui-spatial-active] *):not([aria-pressed="true"]):not([data-ui-spatial-related-active])': 0.3,
    },
  },
  dot: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: {
      default: "var(--console-text-muted)",
      ':is([data-tone="good"] > *)': "var(--console-ok)",
      ':is([data-tone="warn"] > *)': "var(--console-warn)",
      ':is([data-tone="error"] > *)': "var(--console-err)",
    },
    borderRadius: "50%",
    backgroundColor: "var(--console-card)",
  },
  pointLabel: { minWidth: 0, overflowWrap: "anywhere" },
  description: {
    margin: "0 0 12px",
    color: "var(--console-text-dim)",
    fontSize: 12.5,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 12px",
    margin: "8px 0 0",
    padding: 0,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    listStyleType: "none",
  },
  legendItem: {
    minWidth: 0,
    overflowWrap: "anywhere",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    content: { default: null, "::before": '""' },
    display: { default: "list-item", "::before": "inline-block" },
    width: { default: null, "::before": 7 },
    height: { default: null, "::before": 7 },
    marginRight: { default: null, "::before": 5 },
    borderWidth: { default: null, "::before": 1 },
    borderStyle: { default: null, "::before": "solid" },
    borderColor: { default: null, "::before": "currentColor" },
    borderRadius: { default: null, "::before": "50%" },
  },
  detail: {
    display: { default: "flex", ":is([hidden])": "none" },
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    color: "var(--console-text-muted)",
    fontSize: 11,
    minWidth: 0,
  },
  detailTitle: {
    margin: "0 0 11px",
    color: "var(--console-text)",
    fontSize: "var(--operator-section-size, 9.5px)",
    fontWeight: "var(--operator-section-weight, 500)",
    letterSpacing: "var(--operator-section-spacing, .16em)",
    textTransform: "var(--operator-section-transform, uppercase)",
    fontFamily: "var(--operator-section-family, var(--console-mono))",
    overflowWrap: "anywhere",
  },
  detailText: { minWidth: 0, overflowWrap: "anywhere" },
});
