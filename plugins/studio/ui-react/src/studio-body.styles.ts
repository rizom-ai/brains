import * as stylex from "@stylexjs/stylex";

type BodyStyle =
  | "root"
  | "toolbar"
  | "modes"
  | "inlineModes"
  | "metadata"
  | "panes"
  | "split"
  | "source"
  | "preview";
export const bodyStyles: Record<BodyStyle, stylex.StyleXStyles> = stylex.create(
  {
    root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
    toolbar: {
      display: "flex",
      alignItems: "center",
      gap: { default: 4, "@container (max-width: 720px)": 8 },
      flexWrap: { default: "nowrap", "@container (max-width: 720px)": "wrap" },
      padding: "12px 26px",
      borderBottom: "1px solid var(--console-rule-strong)",
      backgroundColor: "transparent",
      minHeight: 0,
      "@media (max-width: 640px)": { minHeight: 44, padding: "7px 14px" },
    },
    modes: { display: { default: null, "@media (max-width: 640px)": "none" } },
    inlineModes: {
      display: { default: null, "@media (max-width: 640px)": "inline-flex" },
    },
    metadata: {
      marginLeft: { default: "auto", "@media (max-width: 640px)": 0 },
      fontFamily: "var(--console-mono)",
      fontSize: { default: 11, "@media (max-width: 640px)": 9 },
      color: "var(--console-text-muted)",
      letterSpacing: 0,
    },
    panes: {
      display: "grid",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      "@media (max-width: 640px)": { height: "100%" },
    },
    split: {
      gridTemplateColumns: {
        default: "1fr 1fr",
        "@container (max-width: 720px)": "minmax(0, 1fr)",
        "@media (max-width: 640px)": "1fr",
      },
      gridTemplateRows: {
        default: null,
        "@container (max-width: 720px)": "minmax(0, 1fr) minmax(0, 1fr)",
        "@media (max-width: 640px)": "minmax(0, 1fr)",
      },
      overflowY: "hidden",
    },
    source: {
      color: "var(--console-text)",
      backgroundColor: "transparent",
      minHeight: 0,
      minWidth: 0,
      borderRightStyle: "solid",
      borderRightColor: "var(--console-rule-strong)",
      borderRightWidth: {
        default: 0,
        ":is([data-studio-split] *)": 1,
        "@container (max-width: 720px)": {
          default: 0,
          ":is([data-studio-split] *)": 0,
        },
      },
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule)",
      borderBottomWidth: {
        default: 0,
        "@container (max-width: 720px)": {
          default: 0,
          ":is([data-studio-split] *)": 1,
        },
      },
      "@media (max-width: 640px)": { minHeight: 0, height: "100%" },
    },
    preview: {
      minWidth: 0,
      outline: {
        default: null,
        ":focus-visible": "2px solid var(--console-accent)",
      },
      outlineOffset: -2,
      minHeight: 0,
      padding: "30px 34px",
      overflowY: "auto",
      overflowWrap: "anywhere",
      overscrollBehavior: "contain",
      scrollbarColor: "var(--console-rule-strong) transparent",
      scrollbarWidth: "thin",
      "@media (min-width: 641px) and (max-width: 900px)": {
        paddingLeft: 24,
        paddingRight: 24,
      },
      "@media (max-width: 640px)": {
        paddingTop: 22,
        paddingRight: 18,
        paddingBottom: 88,
        paddingLeft: 18,
        overflowY: "auto",
        display: { default: null, ":is([data-studio-split] *)": "none" },
      },
    },
  },
);
