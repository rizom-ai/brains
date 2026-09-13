import * as stylex from "@stylexjs/stylex";

type EditorStyle =
  | "status"
  | "listingRow"
  | "publication"
  | "propertiesHead"
  | "propertiesLabel"
  | "mobileModes"
  | "paneTrigger"
  | "pipeline";
export const editorStyles: Record<EditorStyle, stylex.StyleXStyles> =
  stylex.create({
    status: {
      display: "inline-flex",
      alignItems: "baseline",
      flexWrap: "wrap",
      gap: "6px",
      fontFamily: "var(--console-ui)",
      fontSize: "12px",
      color: "var(--console-text-muted)",
    },
    listingRow: {
      gridTemplateColumns: "36px minmax(0, 1fr) auto",
      "@media (max-width: 640px)": {
        gridTemplateColumns: "24px minmax(0, 1fr) auto",
      },
    },
    publication: {
      display: "block",
      marginTop: "4px",
      fontFamily: "var(--console-ui)",
      fontSize: "11px",
      fontWeight: 400,
      color: "var(--console-text-muted)",
      textTransform: "capitalize",
      letterSpacing: 0,
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
      color:
        "color-mix(in srgb, var(--console-text-muted) 70%, var(--console-text))",
      cursor: "pointer",
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
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
    },
  });
export function editorClassName(
  hook: string,
  ...styles: stylex.StyleXStyles[]
): string {
  return `${hook} ${stylex.props(...styles).className ?? ""}`;
}
