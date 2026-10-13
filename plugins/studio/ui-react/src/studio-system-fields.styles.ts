import * as stylex from "@stylexjs/stylex";

type SystemFieldStyle =
  | "root"
  | "grid"
  | "wide"
  | "section"
  | "heading"
  | "intro"
  | "bodyHeading"
  | "description"
  | "profile"
  | "row"
  | "term"
  | "value"
  | "list"
  | "collectionIntro"
  | "collectionRow"
  | "collectionTitle"
  | "collectionMeta"
  | "onlyField"
  | "link";
export const systemFieldStyles: Record<SystemFieldStyle, stylex.StyleXStyles> =
  stylex.create({
    root: { minWidth: 0 },
    collectionIntro: {
      margin: "20px 0 24px",
      color: "var(--console-text-dim)",
      fontSize: 14,
      lineHeight: 1.65,
      maxWidth: "75ch",
    },
    collectionRow: {
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      paddingBlock: 22,
      "@media (max-width: 640px)": {
        gridTemplateColumns: "minmax(0, 1fr) auto",
        paddingBlock: 20,
      },
    },
    collectionTitle: {
      fontSize: 23,
      fontWeight: 500,
      "@media (max-width: 640px)": { fontSize: 21 },
    },
    collectionMeta: {
      display: "block",
      fontFamily: "var(--console-ui)",
      fontSize: 12,
      fontWeight: 400,
      color: "var(--console-text-dim)",
      marginTop: 7,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: "22px 28px",
      "@media (max-width: 1000px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    },
    wide: { gridColumn: "1 / -1", minWidth: 0 },
    onlyField: { gridColumn: { default: null, ":only-child": "1 / -1" } },
    link: { color: "var(--console-text)", textUnderlineOffset: 3 },
    section: {
      borderTop: "1px solid var(--console-rule-strong)",
      marginTop: 28,
      paddingTop: 24,
      minWidth: 0,
    },
    heading: {
      fontSize: 14,
      fontWeight: 650,
      marginTop: 0,
      marginBottom: 20,
      color: "var(--console-text)",
    },
    intro: {
      color: "var(--console-text-dim)",
      fontSize: 14,
      lineHeight: 1.65,
      maxWidth: "75ch",
      margin: "24px 36px 0",
      "@media (max-width: 640px)": { margin: "22px 20px 0" },
    },
    bodyHeading: {
      padding: "26px 36px 0",
      "@media (max-width: 640px)": { padding: "22px 20px 0" },
    },
    description: {
      color: "var(--console-text-dim)",
      fontSize: 13,
      lineHeight: 1.65,
      marginTop: 8,
      marginBottom: 18,
      maxWidth: "75ch",
    },
    profile: { margin: 0, minWidth: 0 },
    row: {
      display: "grid",
      gridTemplateColumns: "minmax(120px, 160px) minmax(0, 1fr)",
      gap: "8px 24px",
      paddingBlock: 18,
      borderTop: "1px solid var(--console-rule-strong)",
      "@media (max-width: 640px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    },
    term: {
      fontSize: 12,
      fontWeight: 650,
      color: "var(--console-text-dim)",
      overflowWrap: "anywhere",
    },
    value: {
      margin: 0,
      minWidth: 0,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      fontSize: 14,
      lineHeight: 1.65,
    },
    list: { margin: 0, paddingInlineStart: 20 },
  });
