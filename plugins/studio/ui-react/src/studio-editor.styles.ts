import * as stylex from "@stylexjs/stylex";

type EditorStyle =
  | "head"
  | "title"
  | "kicker"
  | "action"
  | "propertiesHead"
  | "propertiesLabel"
  | "mobileModes"
  | "paneTrigger"
  | "paneContext"
  | "pipeline";
export const editorStyles: Record<EditorStyle, stylex.StyleXStyles> =
  stylex.create({
    head: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "end",
      gap: "22px",
      margin: 0,
      padding: "25px 28px 17px",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-frame)",
      "@media (max-width: 640px)": { padding: "17px 16px 13px", gap: "12px" },
    },
    title: {
      margin: "5px 0 0",
      fontFamily: "var(--console-display)",
      color: "var(--console-text)",
      fontSize: "38px",
      fontWeight: 500,
      lineHeight: 1,
      letterSpacing: "-0.025em",
      "@media (max-width: 640px)": { fontSize: "27px" },
    },
    kicker: {
      color: "var(--console-accent)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      fontWeight: 650,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
    },
    action: {
      display: "block",
      position: "static",
      margin: 0,
      inset: "auto",
      width: "auto",
      padding: 0,
    },
    propertiesHead: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: "15px",
      paddingBottom: 0,
      "@media (max-width: 640px)": { display: "none" },
    },
    propertiesLabel: {
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
      fontWeight: 500,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      margin: 0,
    },
    mobileModes: {
      display: "none",
      "@media (max-width: 640px)": {
        display: "flex",
        gridColumn: "1 / -1",
        gridRow: "2",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottomWidth: "1px",
        borderBottomStyle: "solid",
        borderBottomColor: "var(--console-rule)",
        backgroundColor: "var(--console-card-soft)",
      },
    },
    paneTrigger: {
      display: "inline-flex",
      alignItems: "center",
      gap: "7px",
      minHeight: "44px",
      padding: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      cursor: "pointer",
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
    },
    paneContext: {
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    },
    pipeline: {
      "--console-bg": "var(--console-text)",
      "--console-frame": "var(--console-text)",
      backgroundColor: "var(--console-card)",
      color: "var(--console-text-muted)",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "var(--console-rule)",
      minHeight: "44px",
      "@media (max-width: 900px)": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    },
  });
export function editorClassName(
  hook: string,
  ...styles: stylex.StyleXStyles[]
): string {
  return `${hook} ${stylex.props(...styles).className ?? ""}`;
}
