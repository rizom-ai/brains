import * as stylex from "@stylexjs/stylex";

export const queryStyles: Record<
  | "root"
  | "controls"
  | "label"
  | "compactLabel"
  | "cssSelect"
  | "control"
  | "footer"
  | "standaloneFooter"
  | "pager",
  stylex.StyleXStyles
> = stylex.create({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "14px 18px",
    minWidth: 0,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    minWidth: 0,
    maxWidth: "100%",
    "@media (max-width: 640px)": {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      width: "100%",
    },
  },
  label: {
    display: "grid",
    gap: 6,
    minWidth: 0,
    maxWidth: "100%",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  compactLabel: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    letterSpacing: ".14em",
    textTransform: "uppercase",
  },
  control: {
    minWidth: 0,
    maxWidth: "100%",
    "@media (max-width: 640px)": {
      width: "100%",
      minHeight: "var(--console-touch)",
      fontSize: 16,
    },
  },
  cssSelect: {
    minHeight: 32,
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
    padding: "0 9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 7,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: 12.5,
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginLeft: "auto",
    minWidth: 0,
    "@media (max-width: 640px)": {
      width: "100%",
      marginLeft: 0,
      justifyContent: "space-between",
    },
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    overflowWrap: "anywhere",
  },
  standaloneFooter: {
    marginLeft: 0,
    justifyContent: "space-between",
    width: "100%",
  },
  pager: { display: "flex", flexWrap: "wrap", gap: 8 },
});
