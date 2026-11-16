import * as stylex from "@stylexjs/stylex";

export const refineStyles: Record<
  | "row"
  | "rowPicked"
  | "mark"
  | "number"
  | "box"
  | "boxPicked"
  | "open"
  | "updated"
  | "notice"
  | "picked"
  | "pickedItem"
  | "pickedIndex"
  | "direction"
  | "directionLabel"
  | "refusal"
  | "phoneBarPicking",
  stylex.StyleXStyles
> = stylex.create({
  // The row is a grid of the mark and the entry; each is its own control.
  row: { cursor: "default" },
  rowPicked: {
    backgroundColor:
      "color-mix(in srgb, var(--console-accent) 9%, transparent)",
    boxShadow: "inset 3px 0 0 var(--console-accent)",
  },
  // Stands where the row's number stands; at rest it is the number.
  mark: {
    display: "inline-grid",
    alignSelf: "baseline",
    justifyItems: "start",
    alignItems: "center",
    minWidth: 0,
    minHeight: 20,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    textAlign: "left",
    cursor: "pointer",
    outlineOffset: 2,
  },
  number: {
    display: {
      default: "inline",
      ":is([data-studio-row]:is(:hover, :focus-within, [data-picking]) *)":
        "none",
    },
  },
  box: {
    display: {
      default: "none",
      ":is([data-studio-row]:is(:hover, :focus-within, [data-picking]) *)":
        "inline-grid",
    },
    placeItems: "center",
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: {
      default: "var(--console-rule-strong)",
      ":is([data-studio-pick]:hover *)": "var(--console-accent)",
    },
    borderRadius: 5,
    color: "var(--console-frame)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  },
  boxPicked: {
    borderColor: "var(--console-accent)",
    backgroundColor: "var(--console-accent)",
  },
  // The entry itself: the row's remaining columns, laid out as they were.
  open: {
    display: "grid",
    gridColumn: "2 / -1",
    gridTemplateColumns: "subgrid",
    columnGap: "inherit",
    alignItems: "baseline",
    minWidth: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  updated: {
    gridColumn: { default: null, "@media (max-width: 640px)": "2" },
    gridRow: { default: null, "@media (max-width: 640px)": "1" },
  },
  notice: { margin: "14px 0 4px" },
  picked: {
    margin: "14px 0 0",
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
    listStyleType: "none",
  },
  pickedItem: {
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1fr)",
    alignItems: "baseline",
    padding: "9px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    fontFamily: "var(--console-display)",
    fontSize: 15.5,
    overflowWrap: "anywhere",
  },
  pickedIndex: {
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
  },
  direction: { display: "grid", gap: 6, marginTop: 16 },
  directionLabel: {
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: 10.5,
    letterSpacing: ".14em",
    textTransform: "uppercase",
  },
  refusal: { marginTop: 14 },
  phoneBarPicking: { justifyContent: "space-between" },
});
