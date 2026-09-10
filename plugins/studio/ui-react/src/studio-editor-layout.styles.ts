import * as stylex from "@stylexjs/stylex";
type LayoutStyle =
  | "body"
  | "editor"
  | "head"
  | "colophon"
  | "fields"
  | "manuscript"
  | "empty"
  | "pipeline"
  | "compactStatus"
  | "compactValue"
  | "spacer"
  | "desktop"
  | "more"
  | "danger";
export const editorLayoutStyles: Record<LayoutStyle, stylex.StyleXStyles> =
  stylex.create({
    body: {
      flex: 1,
      minHeight: 0,
      display: "grid",
      alignItems: "stretch",
      gridTemplateRows: "minmax(0, 1fr)",
      "@media (min-width: 901px)": { overflow: "hidden" },
      "@media (max-width: 640px)": {
        gridTemplateRows: {
          default: "auto",
          ":is([data-studio-shell][data-view=editor] > *)": "minmax(0, 1fr)",
        },
        alignContent: "start",
        overflow: {
          default: "visible",
          ":is([data-studio-shell][data-view=editor] > *)": "hidden",
        },
      },
    },
    editor: {
      display: "grid",
      gridTemplateColumns: "clamp(230px, 20vw, 280px) minmax(0, 1fr)",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
      minHeight: 0,
      minWidth: 0,
      "@media (min-width: 641px) and (max-width: 900px)": {
        gridTemplateColumns: "260px minmax(0, 1fr)",
      },
      "@media (max-width: 640px)": {
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto 44px minmax(0, 1fr) auto",
        overflow: "hidden",
      },
    },
    head: {
      gridColumn: "1 / -1",
      gridRow: "1",
      margin: "18px 26px 0",
      "@media (max-width: 640px)": { margin: "10px 16px 0" },
    },
    colophon: {
      gridColumn: "1",
      gridRow: "2",
      minHeight: 0,
      minWidth: 0,
      overflowY: "auto",
      borderRight: "1px solid var(--console-rule-strong)",
      backgroundColor: "var(--console-card-soft)",
      padding: "26px 26px 60px",
      "@media (min-width: 641px) and (max-width: 900px)": {
        paddingLeft: 20,
        paddingRight: 20,
      },
      "@media (max-width: 640px)": {
        gridRow: "3",
        padding: "18px 18px 88px",
        borderRightWidth: 0,
        display: {
          default: null,
          ":is([data-studio-editor][data-mobile-pane=write] > *)": "none",
          ":is([data-studio-editor][data-mobile-pane=preview] > *)": "none",
        },
      },
    },
    fields: { borderWidth: 0, margin: 0, padding: 0, minInlineSize: 0 },
    manuscript: {
      display: "flex",
      flexDirection: "column",
      gridColumn: "2",
      gridRow: "2",
      minHeight: 0,
      minWidth: 0,
      containerType: "inline-size",
      backgroundColor: "var(--console-card)",
      "@media (min-width: 901px)": { overflow: "hidden" },
      "@media (max-width: 640px)": {
        gridColumn: "1",
        gridRow: "3",
        overflowY: "auto",
        display: {
          default: "flex",
          ":is([data-studio-editor][data-mobile-pane=details] > *)": "none",
        },
      },
    },
    empty: { padding: "30px 34px" },
    pipeline: {
      gridColumn: "1 / -1",
      gridRow: "3",
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      padding: "0 20px",
      minHeight: 58,
      "@media (min-width: 641px) and (max-width: 900px)": {
        gap: 10,
        padding: "7px 12px",
      },
      "@media (max-width: 640px)": {
        gridColumn: "1",
        gridRow: "4",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 10,
        minHeight: 56,
        padding: "6px 12px calc(6px + env(safe-area-inset-bottom))",
      },
      borderTopColor: {
        default: "var(--console-rule)",
        ":is([data-climate=instrument] *)": "var(--console-accent)",
      },
      backgroundColor: {
        default: "var(--console-card)",
        ":is([data-climate=instrument] *)": "var(--console-card-soft)",
      },
    },
    compactStatus: {
      display: {
        default: "none",
        "@media (max-width: 900px)": "block",
        "@media (max-width: 640px)": {
          default: "block",
          ":is([data-studio-save-bar]:has(> [data-studio-status]) > *)": "none",
        },
      },
      minWidth: 0,
      overflow: "hidden",
      color: {
        default: "var(--console-bg)",
        ":is([data-climate=instrument] *)": "var(--console-text)",
      },
      fontFamily: "var(--console-mono)",
      fontSize: 8,
      letterSpacing: ".05em",
      lineHeight: 1.35,
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    compactValue: {
      display: "block",
      overflow: "hidden",
      color: "var(--console-ok)",
      fontSize: 9,
      textOverflow: "ellipsis",
    },
    spacer: { flex: 1, "@media (max-width: 900px)": { display: "none" } },
    desktop: {
      display: { default: null, "@media (max-width: 900px)": "none" },
    },
    more: {
      display: { default: "none", "@media (max-width: 900px)": "inline-flex" },
    },
    danger: {
      borderColor: "color-mix(in srgb, var(--console-bg) 30%, transparent)",
      color: {
        default: "color-mix(in srgb, var(--console-bg) 75%, transparent)",
        ":hover": "var(--console-frame)",
      },
      backgroundColor: {
        default: null,
        ":hover": "color-mix(in srgb, var(--console-err) 25%, transparent)",
      },
      "@media (max-width: 640px)": {
        minHeight: "var(--console-touch)",
        paddingLeft: 10,
        paddingRight: 10,
        fontSize: 11,
      },
    },
  });
