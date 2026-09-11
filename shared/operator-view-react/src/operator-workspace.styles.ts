import * as stylex from "@stylexjs/stylex";
export const workspaceStyles: Record<
  | "frame"
  | "embedded"
  | "sections"
  | "comfortableSections"
  | "section"
  | "sectionAfter"
  | "wide"
  | "query",
  stylex.StyleXStyles
> = stylex.create({
  frame: {
    minHeight: 0,
    maxWidth: 1440,
    padding: "26px 34px 40px",
    overflowY: "auto",
    "@media (max-width: 900px)": { padding: "20px 18px 28px" },
  },
  embedded: {
    minHeight: "auto",
    padding: 0,
    overflowX: "visible",
    overflowY: "visible",
    "@media (max-width: 900px)": { padding: 0 },
  },
  sections: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))",
    alignItems: "start",
    gap: "26px 40px",
    paddingTop: 24,
    "@media (max-width: 640px)": {
      gridTemplateColumns: "minmax(0,1fr)",
      gap: "var(--operator-sections-gap, 26px 40px)",
      paddingTop: "var(--operator-sections-padding-top, 24px)",
    },
  },
  comfortableSections: {
    gap: 26,
    paddingTop: 28,
    "@media (max-width: 640px)": {
      gap: "var(--operator-sections-gap, 28px)",
      paddingTop: "var(--operator-sections-padding-top, 24px)",
    },
  },
  section: { minWidth: 0 },
  sectionAfter: { marginTop: 26 },
  wide: { gridColumn: "1 / -1" },
  query: { marginTop: -6 },
});
