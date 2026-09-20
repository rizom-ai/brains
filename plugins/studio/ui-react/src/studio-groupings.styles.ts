import * as stylex from "@stylexjs/stylex";
export const groupingStyles: Record<"badge" | "hint", stylex.StyleXStyles> =
  stylex.create({
    badge: {
      display: "block",
      width: "fit-content",
      marginTop: 6,
      padding: "2px 5px",
      border: "1px solid var(--console-rule-strong)",
      borderRadius: 4,
      fontFamily: "var(--console-mono)",
      fontSize: 9,
      fontWeight: 400,
      textTransform: "uppercase",
      color: "var(--console-text-muted)",
    },
    hint: {
      fontFamily: "var(--console-ui)",
      fontSize: 13,
      lineHeight: 1.6,
      color: "var(--console-text-muted)",
      marginTop: 16,
      marginBottom: 24,
    },
  });
