import * as stylex from "@stylexjs/stylex";

type ImageDetailsStyle =
  | "details"
  | "preview"
  | "fields"
  | "label"
  | "source"
  | "uses"
  | "useList"
  | "useLink";

export const imageDetailsStyles: Record<
  ImageDetailsStyle,
  stylex.StyleXStyles
> = stylex.create({
  details: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 14,
    margin: "0 0 12px",
  },
  preview: {
    justifySelf: "start",
    width: "auto",
    maxWidth: "100%",
    height: "auto",
    maxHeight: 160,
    objectFit: "contain",
    borderRadius: 4,
    border: "1px solid var(--console-rule-strong)",
  },
  fields: { display: "grid", gap: 10, minWidth: 0 },
  label: { display: "grid", gap: 4 },
  source: { margin: 0, fontSize: 12, color: "var(--console-text-dim)" },
  uses: { display: "grid", gap: 6, marginTop: 8 },
  useList: {
    display: "grid",
    gap: 4,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  useLink: {
    color: "var(--console-text)",
    fontSize: 13.5,
    textUnderlineOffset: 3,
  },
});
