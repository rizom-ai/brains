import * as stylex from "@stylexjs/stylex";

export const recoveryStyles: Record<
  "versions" | "version" | "actions",
  stylex.StyleXStyles
> = stylex.create({
  versions: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
    gap: 16,
    "@media (max-width: 640px)": { gridTemplateColumns: "minmax(0,1fr)" },
  },
  version: {
    width: "100%",
    minWidth: 0,
    height: 220,
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    color: "var(--console-text)",
    backgroundColor: "var(--console-card)",
    border: "1px solid var(--console-rule)",
    padding: 12,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
});
