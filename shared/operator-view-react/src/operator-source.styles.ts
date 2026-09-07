import * as stylex from "@stylexjs/stylex";
export const sourceStyles: Record<
  "root" | "frame" | "heading" | "compactHeading" | "text" | "caption",
  stylex.StyleXStyles
> = stylex.create({
  root: { minWidth: 0 },
  frame: {
    padding: "16px 18px 18px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 8,
    backgroundColor: "var(--console-card)",
  },
  heading: {
    margin: "0 0 11px",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    fontWeight: 650,
    overflowWrap: "anywhere",
  },
  compactHeading: {
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  text: {
    maxHeight: "min(52vh,40rem)",
    margin: 0,
    overflow: "auto",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  caption: {
    display: "block",
    marginTop: 11,
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
  },
});
