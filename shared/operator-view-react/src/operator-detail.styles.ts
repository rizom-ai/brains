import * as stylex from "@stylexjs/stylex";
export const detailStyles: Record<
  | "root"
  | "split"
  | "master"
  | "hiddenMaster"
  | "pane"
  | "heading"
  | "back"
  | "body",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    alignItems: "start",
    gap: 28,
    minWidth: 0,
  },
  split: {
    gridTemplateColumns: {
      default: "minmax(0,.9fr) minmax(0,1.1fr)",
      "@media (max-width: 860px)": "minmax(0,1fr)",
    },
  },
  master: { minWidth: 0 },
  hiddenMaster: {
    minWidth: 0,
    "@media (max-width: 860px)": { display: "none" },
  },
  pane: {
    minWidth: 0,
    padding: { default: 24, "@media (max-width: 640px)": 18 },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    backgroundColor: "var(--console-card)",
  },
  heading: {
    margin: "0 0 20px",
    fontFamily: "var(--console-display)",
    fontSize: 24,
    fontWeight: 400,
    fontVariationSettings: '"SOFT" 70,"opsz" 40',
    lineHeight: 1.3,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
    outline: "none",
    ":focus-visible": { boxShadow: "-10px 0 0 var(--console-accent)" },
  },
  back: {
    display: { default: "none", "@media (max-width: 860px)": "inline-flex" },
    alignItems: "center",
    minHeight: "var(--console-touch)",
    marginBottom: 12,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    color: "var(--console-accent)",
    cursor: "pointer",
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 3,
    },
  },
  body: { display: "grid", gap: 20, minWidth: 0 },
});
