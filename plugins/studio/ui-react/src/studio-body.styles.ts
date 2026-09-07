import * as stylex from "@stylexjs/stylex";

type BodyStyle =
  | "root"
  | "toolbar"
  | "modes"
  | "metadata"
  | "assist"
  | "input"
  | "select"
  | "run"
  | "presets"
  | "preset"
  | "assistMeta"
  | "suggestion"
  | "answer"
  | "copy"
  | "answerTitle"
  | "spacer"
  | "status"
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
    metadata: {
      marginLeft: { default: "auto", "@media (max-width: 640px)": 0 },
      fontFamily: "var(--console-mono)",
      fontSize: { default: 11, "@media (max-width: 640px)": 9 },
      color: "var(--console-text-muted)",
      letterSpacing: 0,
    },
    assist: {
      display: {
        default: "flex",
        ":is([data-has-selection='false'])": "none",
        "@media (max-width: 640px)": {
          default: "grid",
          ":is([data-has-selection='false'])": "none",
        },
      },
      alignItems: "center",
      gap: 10,
      padding: "10px 26px",
      borderBottom: "1px solid var(--console-rule-strong)",
      backgroundColor: "var(--console-rule)",
      minHeight: 0,
      "@media (max-width: 640px)": {
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 8,
        padding: "9px 12px",
      },
    },
    input: {
      flex: 1,
      minWidth: 180,
      "@media (max-width: 640px)": { minWidth: 0, fontSize: 16 },
    },
    select: {
      maxWidth: 220,
      "@media (max-width: 640px)": {
        gridColumn: "1 / -1",
        width: "100%",
        maxWidth: "none",
      },
    },
    run: { padding: "8px 14px", whiteSpace: "nowrap" },
    presets: {
      display: "inline-flex",
      gap: 4,
      "@media (max-width: 640px)": { gridColumn: "1 / -1", overflowX: "auto" },
    },
    preset: {
      whiteSpace: { default: null, "@media (max-width: 640px)": "nowrap" },
    },
    assistMeta: {
      fontFamily: "var(--console-mono)",
      fontSize: 11,
      color: "var(--console-text-muted)",
      whiteSpace: "nowrap",
      "@media (max-width: 640px)": { display: "none" },
    },
    suggestion: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 26px",
      borderBottom: "1px solid var(--console-rule-strong)",
      backgroundColor: "var(--console-ok-soft)",
      "@media (max-width: 640px)": {
        alignItems: "stretch",
        flexWrap: "wrap",
        padding: "10px 12px",
      },
    },
    answer: { backgroundColor: "var(--console-accent-soft)" },
    copy: {
      maxHeight: 150,
      overflow: "auto",
      fontSize: 13,
      color: "var(--console-text)",
      overflowWrap: "anywhere",
      "@media (max-width: 640px)": { width: "100%", maxHeight: 110 },
    },
    answerTitle: {
      display: "block",
      marginBottom: 6,
      fontFamily: "var(--console-mono)",
      fontSize: 10,
      letterSpacing: ".04em",
      color: "var(--console-accent-dim)",
    },
    spacer: { flex: 1 },
    status: {
      padding: "8px 26px",
      borderBottom: "1px solid var(--console-rule-strong)",
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
