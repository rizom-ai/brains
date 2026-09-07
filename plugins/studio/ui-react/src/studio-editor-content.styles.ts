import * as stylex from "@stylexjs/stylex";

type ContentStyle =
  | "editor"
  | "content"
  | "properties"
  | "manuscript"
  | "disclosure"
  | "summary"
  | "summaryDescription"
  | "disclosedFields";
export const editorContentStyles: Record<ContentStyle, stylex.StyleXStyles> =
  stylex.create({
    editor: {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
      "@media (min-width: 641px) and (max-width: 900px)": {
        gridTemplateColumns: "minmax(0, 1fr)",
      },
      "@media (max-width: 640px)": {
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
      },
    },
    content: {
      gridColumn: "1 / -1",
      gridRow: "2",
      minWidth: 0,
      minHeight: 0,
      overflowY: "auto",
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: -2,
      },
      display: "flex",
      flexDirection: "column",
      backgroundColor: "var(--console-card)",
    },
    properties: {
      flexShrink: 0,
      overflowY: "visible",
      borderRightWidth: 0,
      backgroundColor: "var(--console-card)",
      padding: "26px 36px",
      "@media (min-width: 641px) and (max-width: 900px)": {
        paddingLeft: 36,
        paddingRight: 36,
      },
      "@media (max-width: 640px)": { padding: "22px 20px 26px" },
    },
    manuscript: {
      flex: "1 0 480px",
      minHeight: 480,
      borderTop: "1px solid var(--console-rule-strong)",
      overflow: "hidden",
      "@media (max-width: 640px)": {
        overflowY: "hidden",
        flexBasis: 400,
        minHeight: 400,
      },
    },
    disclosure: {
      flexShrink: 0,
      minWidth: 0,
      margin: "20px 36px",
      border: "1px solid var(--console-rule-strong)",
      borderRadius: 4,
      "@media (max-width: 640px)": { margin: "18px 20px" },
    },
    disclosedFields: { padding: "6px 16px 20px", minWidth: 0 },
    summaryDescription: {
      fontSize: 12,
      fontWeight: 400,
      color: "var(--console-text-dim)",
      marginInlineStart: 14,
      display: { default: "inline", "@media (max-width: 640px)": "none" },
    },
    summary: {
      cursor: "pointer",
      padding: "14px 16px",
      fontSize: 14,
      fontWeight: 650,
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: 2,
      },
    },
  });
