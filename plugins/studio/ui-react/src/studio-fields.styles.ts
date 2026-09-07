import * as stylex from "@stylexjs/stylex";
type FieldStyle =
  | "field"
  | "label"
  | "required"
  | "kind"
  | "inline"
  | "inlineLabel"
  | "control"
  | "date"
  | "readOnly"
  | "imageRef"
  | "imageCode"
  | "clear"
  | "upload"
  | "glyph"
  | "uploadTitle"
  | "uploadNote"
  | "file"
  | "tags"
  | "tag"
  | "tagButton"
  | "tagAdd"
  | "tagInput"
  | "assist"
  | "suggestion"
  | "suggestionCopy"
  | "suggestionTags"
  | "suggestionToken";
export const fieldStyles: Record<FieldStyle, stylex.StyleXStyles> =
  stylex.create({
    field: {
      display: "block",
      padding: "14px 0 16px",
      borderTop: "1px solid var(--console-rule-strong)",
      paddingBottom: { default: 16, ":is([data-studio-field-assist] *)": 9 },
      "@media (max-width: 640px)": {
        paddingTop: 12,
        paddingBottom: { default: 12, ":is([data-studio-field-assist] *)": 9 },
      },
    },
    label: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: ".02em",
      color: "var(--console-text-dim)",
      marginBottom: 7,
    },
    required: {
      fontFamily: "var(--console-mono)",
      fontStyle: "normal",
      fontSize: 10,
      color: "var(--console-accent)",
    },
    kind: {
      fontFamily: "var(--console-mono)",
      fontStyle: "normal",
      fontSize: 10,
      color: "var(--console-text-muted)",
      fontWeight: 400,
    },
    inline: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    inlineLabel: { marginBottom: 0 },
    control: {
      borderColor: { default: null, ":user-invalid": "var(--console-err)" },
      boxShadow: {
        default: null,
        ":user-invalid":
          "0 0 0 3px color-mix(in srgb, var(--console-err) 12%, transparent)",
      },
      "@media (max-width: 640px)": { fontSize: 16 },
    },
    date: {
      fontFamily: "var(--console-mono)",
      colorScheme: {
        default: "light",
        ":is([data-climate='instrument'] *)": "dark",
      },
    },
    readOnly: {
      fontFamily: "var(--console-mono)",
      borderStyle: "dashed",
      backgroundColor:
        "color-mix(in srgb, var(--console-text) 3%, var(--console-card))",
      cursor: "not-allowed",
      opacity: { default: 0.78, ":disabled": 0.78 },
    },
    imageRef: {
      display: "flex",
      alignItems: "stretch",
      gap: 8,
      margin: "0 0 8px",
    },
    imageCode: {
      display: "flex",
      minWidth: 0,
      flex: 1,
      alignItems: "center",
      fontFamily: "var(--console-mono)",
      fontSize: 11,
      backgroundColor: "var(--console-card)",
      border: "1px solid var(--console-rule-strong)",
      padding: "3px 8px",
      borderRadius: 4,
      overflowWrap: "anywhere",
    },
    clear: {
      fontFamily: "var(--console-ui)",
      fontSize: 12,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: {
        default: "var(--console-rule-strong)",
        ":hover": "color-mix(in srgb, var(--console-accent) 40%, transparent)",
      },
      backgroundColor: "transparent",
      color: {
        default: "var(--console-text-dim)",
        ":hover": "var(--console-accent-dim)",
      },
      borderRadius: 5,
      padding: "3px 9px",
      cursor: "pointer",
    },
    upload: {
      display: "grid",
      justifyItems: "center",
      padding: "22px 16px",
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: {
        default: "var(--console-text-muted)",
        ":hover": "var(--console-accent)",
        ":focus-within": "var(--console-accent)",
      },
      borderRadius: 9,
      backgroundColor: {
        default: "color-mix(in srgb, var(--console-card) 75%, transparent)",
        ":hover":
          "color-mix(in srgb, var(--console-accent) 4%, var(--console-card))",
        ":focus-within":
          "color-mix(in srgb, var(--console-accent) 4%, var(--console-card))",
      },
      cursor: "pointer",
      textAlign: "center",
      transitionProperty: {
        default: "border-color, background-color",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
      transitionDuration: "150ms",
      transitionTimingFunction: "ease",
    },
    glyph: {
      color: "var(--console-accent-dim)",
      font: "30px/1 var(--console-display)",
      fontVariationSettings: '"SOFT" 100',
    },
    uploadTitle: {
      marginTop: 8,
      color: "var(--console-text)",
      fontSize: 13,
      fontWeight: 500,
    },
    uploadNote: {
      marginTop: 3,
      color: "var(--console-text-muted)",
      font: "9.5px var(--console-mono)",
    },
    file: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clipPath: "inset(50%)",
    },
    tags: { display: "flex", flexWrap: "wrap", gap: 6 },
    tag: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      minHeight: 28,
      padding: "3px 5px 3px 10px",
      border: "1px solid var(--console-rule-strong)",
      borderRadius: 999,
      backgroundColor: "var(--console-card)",
      color: "var(--console-text-dim)",
      fontSize: 12,
      minWidth: 0,
      overflowWrap: "anywhere",
    },
    tagButton: {
      display: "grid",
      width: 20,
      height: 20,
      minHeight: 20,
      placeItems: "center",
      borderWidth: 0,
      borderRadius: "50%",
      backgroundColor: {
        default: "transparent",
        ":hover": "var(--console-accent-soft)",
        ":focus-visible": "var(--console-accent-soft)",
      },
      color: {
        default: "var(--console-text-muted)",
        ":hover": "var(--console-accent-dim)",
        ":focus-visible": "var(--console-accent-dim)",
      },
      cursor: "pointer",
      font: "13px/1 var(--console-mono)",
      "@media (max-width: 640px)": { width: 44, height: 44 },
    },
    tagAdd: { borderStyle: "dashed", paddingLeft: 9 },
    tagInput: {
      width: { default: 58, ":focus": 86 },
      minWidth: 0,
      padding: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "var(--console-text)",
      fontSize: { default: 12, "@media (max-width: 640px)": 16 },
      boxShadow: "none",
      "::placeholder": { color: "var(--console-text-muted)" },
    },
    assist: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 0 12px",
    },
    suggestion: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      margin: "0 0 12px",
      padding: 9,
      border: "1px solid var(--console-rule-accent)",
      borderRadius: 7,
      backgroundColor: "var(--console-accent-soft)",
    },
    suggestionCopy: {
      flex: "1 0 100%",
      fontSize: 12,
      lineHeight: 1.45,
      color: "var(--console-text)",
    },
    suggestionTags: {
      display: "flex",
      flex: "1 0 100%",
      flexWrap: "wrap",
      gap: 5,
    },
    suggestionToken: {
      fontFamily: "var(--console-mono)",
      fontSize: 10,
      padding: "3px 6px",
      borderRadius: 4,
      backgroundColor: "var(--console-card)",
      color: "var(--console-text)",
    },
  });
