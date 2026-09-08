import * as stylex from "@stylexjs/stylex";

export const panelColumnsStyles: Record<
  "root" | "primary" | "aside",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    display: "grid",
    alignItems: "start",
    gridTemplateColumns: {
      default: "minmax(0,2fr) minmax(270px,.86fr)",
      "@media (max-width: 960px)": "minmax(0,1fr)",
    },
    gap: 14,
    minWidth: 0,
  },
  primary: {
    gridTemplateColumns: {
      default: "repeat(2,minmax(0,1fr))",
      "@media (max-width: 700px)": "minmax(0,1fr)",
    },
    gap: 14,
    minWidth: 0,
  },
  aside: {
    display: { default: "flex", "@media (max-width: 960px)": "grid" },
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
    gridTemplateColumns: {
      default: null,
      "@media (max-width: 960px)": "repeat(3,minmax(0,1fr))",
      "@media (max-width: 700px)": "minmax(0,1fr)",
    },
  },
});
