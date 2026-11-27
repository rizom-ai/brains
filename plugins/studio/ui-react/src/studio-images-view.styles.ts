import * as stylex from "@stylexjs/stylex";

export const imagesViewStyles: Record<
  | "page"
  | "layout"
  | "grid"
  | "card"
  | "cardPicked"
  | "thumb"
  | "thumbImage"
  | "pending"
  | "title"
  | "missing"
  | "details",
  stylex.StyleXStyles
> = stylex.create({
  page: { minWidth: 0 },
  // The grid, and beside it the image being described.
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      ":has(> [data-studio-image-panel])":
        "minmax(0, 1fr) clamp(300px, 26vw, 360px)",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    gap: 28,
    alignItems: "start",
    marginTop: 22,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 18,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  card: {
    display: "grid",
    gap: 8,
    width: "100%",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    outline: {
      default: null,
      ":focus-visible": "2px solid var(--console-accent)",
    },
    outlineOffset: 2,
    borderRadius: 6,
  },
  cardPicked: {
    outline: "2px solid var(--console-accent)",
    outlineOffset: 2,
  },
  thumb: {
    display: "block",
    aspectRatio: "4 / 3",
    overflow: "hidden",
    borderRadius: 6,
  },
  thumbImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  pending: {
    display: "block",
    width: "100%",
    height: "100%",
    backgroundColor: "var(--console-card)",
  },
  title: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontFamily: "var(--console-ui)",
    fontSize: 13.5,
    color: "var(--console-text)",
  },
  missing: {
    display: "block",
    marginTop: 2,
    fontSize: 11.5,
    color: "var(--console-warn)",
  },
  details: {
    position: { default: "sticky", "@media (max-width: 900px)": "static" },
    top: 18,
    minWidth: 0,
  },
});
