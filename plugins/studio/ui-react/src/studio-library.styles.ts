import * as stylex from "@stylexjs/stylex";
export const libraryStyles: Record<
  | "frame"
  | "readable"
  | "boot"
  | "listing"
  | "row"
  | "index"
  | "title"
  | "excerpt"
  | "covered"
  | "cover"
  | "coverImage"
  | "coverPending"
  | "updated"
  | "empty"
  | "pagination"
  | "pager"
  | "range"
  | "recordLink",
  stylex.StyleXStyles
> = stylex.create({
  // An entry row that is a link keeps the measure it had as a button.
  recordLink: {
    color: "inherit",
    textDecoration: "none",
    lineHeight: "normal",
  },
  readable: {
    color: "var(--console-text)",
    "--console-text-muted":
      "color-mix(in srgb, var(--color-text-light) 70%, var(--color-text))",
  },
  frame: {
    // Small secondary labels must remain readable in both Studio climates.
    "--console-text-muted":
      "color-mix(in srgb, var(--color-text-light) 70%, var(--color-text))",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    backgroundColor: "var(--console-frame)",
  },
  boot: { padding: 48 },
  listing: {
    width: "auto",
    margin: 0,
    paddingBottom: 34,
    "@media (min-width: 901px)": { overflowY: "auto" },
    "@media (max-width: 640px)": {
      minWidth: 0,
      overflow: "visible",
      paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
    },
  },
  row: {
    display: "grid",
    gap: 18,
    alignItems: "baseline",
    width: "100%",
    padding: "15px 4px 14px",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-card)",
    },
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: {
      default: "background-color",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionDuration: ".12s",
    transitionTimingFunction: "ease",
    fontFamily: "var(--console-ui)",
    minHeight: 0,
    "@media (max-width: 640px)": {
      gap: "4px 10px",
      minHeight: 64,
      padding: "14px 2px",
    },
  },
  index: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text-muted)",
  },
  title: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 50, "opsz" 30',
    fontWeight: 520,
    fontSize: 17.5,
    letterSpacing: "-.005em",
    color: {
      default: "var(--console-text)",
      ":is([data-studio-record]:hover *)": "var(--console-accent-dim)",
    },
    "@media (max-width: 640px)": { fontSize: 17, lineHeight: 1.2 },
  },
  // A type with covers gives every row a thumbnail column, so titles align
  // whether or not an entry has a cover.
  // Shaped as the listing row's columns are, so it overrides them at
  // every width.
  covered: {
    gridTemplateColumns: "36px 64px minmax(0, 1fr) auto",
    "@media (max-width: 640px)": {
      gridTemplateColumns: "24px 48px minmax(0, 1fr)",
    },
  },
  cover: {
    display: "block",
    alignSelf: "start",
    width: "100%",
    aspectRatio: "4 / 3",
    overflow: "hidden",
    borderRadius: 4,
  },
  // Where a cover is still arriving; a row without one shows nothing.
  coverPending: {
    display: "block",
    width: "100%",
    height: "100%",
    backgroundColor: "var(--console-card)",
  },
  coverImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // What the entry is about, under its title: two lines at most.
  excerpt: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    marginTop: 4,
    fontFamily: "var(--console-ui)",
    fontSize: 13.5,
    fontWeight: 400,
    lineHeight: 1.45,
    letterSpacing: 0,
    color: "var(--console-text-muted)",
  },
  updated: {
    justifySelf: "auto",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-ui)",
    fontSize: 12.5,
    letterSpacing: 0,
    "@media (max-width: 640px)": {
      // Under the title, in the last column, with or without a thumbnail.
      gridColumn: "-2 / -1",
      gridRow: "2",
      justifySelf: "start",
      alignSelf: "baseline",
      fontFamily: "var(--console-mono)",
      fontSize: 9,
    },
  },
  empty: { padding: "22px 4px" },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
    padding: "14px 4px 0",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    "@media (max-width: 640px)": {
      justifyContent: "space-between",
      gap: 8,
      paddingTop: 12,
    },
  },
  pager: { display: "inline-flex", gap: 6 },
  range: { whiteSpace: "nowrap" },
});
