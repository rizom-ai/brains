import * as stylex from "@stylexjs/stylex";
export const actionLayoutStyles: Record<
  "group" | "menu" | "link",
  stylex.StyleXStyles
> = stylex.create({
  group: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  menu: { display: "grid", gap: 12, minWidth: 0 },
  link: {
    borderWidth: 0,
    padding: 0,
    minHeight: 32,
    backgroundColor: "transparent",
    color: "var(--console-accent)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "start",
    ":hover": { textDecorationLine: "underline" },
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 4,
    },
    ":disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
});
