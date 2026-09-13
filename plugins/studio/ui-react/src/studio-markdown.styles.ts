import * as stylex from "@stylexjs/stylex";

type MarkdownStyle =
  | "heading"
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "emphasis"
  | "quote"
  | "list"
  | "item"
  | "code"
  | "codeBlock"
  | "codeHeader"
  | "codeLanguage"
  | "codeActions"
  | "copyButton"
  | "codeScroller"
  | "codePre"
  | "codeBody"
  | "codeLine"
  | "lineNumber"
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "name"
  | "operator"
  | "tableRow"
  | "tableFrame"
  | "table"
  | "tableHead"
  | "tableHeaderCell"
  | "tableCell"
  | "image"
  | "assist";

export const markdownStyles: Record<MarkdownStyle, stylex.StyleXStyles> =
  stylex.create({
    heading: {
      fontFamily: "var(--console-display)",
      fontVariationSettings: '"SOFT" 70, "opsz" 90',
      fontWeight: 580,
      letterSpacing: "-.01em",
      lineHeight: 1.12,
      margin: "0 0 18px",
      overflowWrap: "anywhere",
    },
    h1: { fontSize: 30, "@media (max-width: 640px)": { fontSize: 27 } },
    h2: { fontSize: 23, marginTop: 26 },
    h3: { fontSize: 18, marginTop: 22 },
    paragraph: {
      fontSize: 15,
      lineHeight: 1.72,
      color: "var(--console-text)",
      marginBottom: 14,
      maxWidth: "62ch",
    },
    emphasis: {
      fontFamily: { default: null, ":is(p *)": "var(--console-display)" },
      fontStyle: "italic",
    },
    quote: {
      borderLeft: "2px solid var(--console-accent)",
      padding: "2px 0 2px 18px",
      margin: "18px 0",
      color: "var(--console-text-dim)",
      fontFamily: "var(--console-display)",
      fontStyle: "italic",
      fontSize: 16.5,
    },
    list: { paddingLeft: 22, marginBottom: 14 },
    item: { fontSize: 15, lineHeight: 1.72 },
    code: {
      fontFamily: "var(--console-mono)",
      fontSize: 12.5,
      backgroundColor:
        "color-mix(in srgb, var(--console-text) 6%, transparent)",
      padding: "1px 5px",
      borderRadius: 4,
    },
    codeBlock: {
      display: "flex",
      width: "100%",
      minWidth: 0,
      flexDirection: "column",
      margin: "18px 0",
      overflow: "hidden",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: 8,
      backgroundColor:
        "color-mix(in srgb, var(--console-text) 4%, var(--console-card))",
    },
    codeHeader: {
      display: "flex",
      minHeight: 36,
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      padding: "4px 5px 4px 13px",
      borderBottomWidth: 1,
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule)",
      "@media (max-width: 640px)": {
        minHeight: "var(--console-touch)",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
      },
    },
    codeLanguage: {
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: 10,
      letterSpacing: ".08em",
      textTransform: "lowercase",
    },
    codeActions: { display: "flex", alignItems: "center" },
    copyButton: {
      display: "grid",
      width: 28,
      height: 28,
      padding: 0,
      placeItems: "center",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: {
        default: "transparent",
        ":hover": "var(--console-rule-strong)",
        ":focus-visible": "var(--console-rule-strong)",
      },
      borderRadius: 5,
      appearance: "none",
      backgroundColor: {
        default: "transparent",
        ":hover": "var(--console-card)",
        ":focus-visible": "var(--console-card)",
      },
      color: {
        default: "var(--console-text-muted)",
        ":hover": "var(--console-accent-dim)",
        ":focus-visible": "var(--console-accent-dim)",
      },
      cursor: "pointer",
      outline: {
        default: null,
        ":focus-visible": "2px solid var(--console-accent)",
      },
      outlineOffset: 2,
      "@media (max-width: 640px)": {
        width: "var(--console-touch)",
        height: "var(--console-touch)",
      },
    },
    codeScroller: {
      minWidth: 0,
      outline: {
        default: null,
        ":focus-visible": "2px solid var(--console-accent-dim)",
      },
      outlineOffset: -2,
      overscrollBehaviorX: "contain",
      overflowX: "auto",
      scrollbarColor: "var(--console-rule-strong) transparent",
      scrollbarWidth: "thin",
    },
    codePre: {
      minWidth: "max-content",
      margin: 0,
      padding: "14px 16px 16px",
      color: "var(--console-text)",
      fontFamily: "var(--console-mono)",
      fontSize: 12.5,
      lineHeight: 1.65,
    },
    codeBody: {
      display: "block",
      padding: 0,
      backgroundColor: "transparent",
      color: "inherit",
      font: "inherit",
    },
    codeLine: {
      display: "grid",
      gridTemplateColumns: "2.5ch max-content",
      columnGap: 14,
      minHeight: "1.65em",
    },
    plain: {},
    keyword: {
      color:
        "color-mix(in srgb, var(--console-accent) 55%, var(--console-text))",
      fontWeight: 600,
    },
    string: {
      color: "color-mix(in srgb, var(--console-ok) 55%, var(--console-text))",
    },
    number: {
      color: "color-mix(in srgb, var(--console-warn) 45%, var(--console-text))",
    },
    comment: {
      color:
        "color-mix(in srgb, var(--console-text-dim) 70%, var(--console-text))",
      fontStyle: "italic",
    },
    name: { color: "var(--console-text)", fontWeight: 600 },
    operator: {
      color:
        "color-mix(in srgb, var(--console-accent) 55%, var(--console-text))",
    },
    tableRow: {
      backgroundColor: {
        default: null,
        ":nth-child(even)":
          "color-mix(in srgb, var(--console-text) 3%, transparent)",
      },
    },
    lineNumber: {
      color: "var(--console-text-muted)",
      textAlign: "right",
      userSelect: "none",
    },
    tableFrame: {
      width: "100%",
      outline: {
        default: null,
        ":focus-visible": "2px solid var(--console-accent-dim)",
      },
      outlineOffset: -2,
      overscrollBehaviorX: "contain",
      margin: "18px 0",
      overflowX: "auto",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: 8,
    },
    table: { width: "100%", borderCollapse: "collapse" },
    tableHead: {
      backgroundColor:
        "color-mix(in srgb, var(--console-text) 4%, transparent)",
    },
    tableHeaderCell: {
      padding: "9px 12px",
      borderRightWidth: 1,
      borderRightStyle: "solid",
      borderRightColor: "var(--console-rule)",
      borderBottomWidth: 1,
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule)",
      color: "var(--console-text-dim)",
      textAlign: "left",
      whiteSpace: "normal",
      minWidth: "12ch",
      verticalAlign: "top",
    },
    tableCell: {
      padding: "9px 12px",
      minWidth: "12ch",
      maxWidth: "48ch",
      overflowWrap: "anywhere",
      verticalAlign: "top",
      lineHeight: 1.6,
      fontVariantNumeric: "tabular-nums",
      borderRightWidth: 1,
      borderRightStyle: "solid",
      borderRightColor: "var(--console-rule)",
      borderBottomWidth: 1,
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule)",
      color: "var(--console-text)",
      fontSize: 13,
      textAlign: "left",
    },
    image: { display: "block", maxWidth: "100%", borderRadius: 8 },
    assist: { marginBottom: 6 },
  });
