import * as stylex from "@stylexjs/stylex";

/** Tone declarations as console surfaces wrote them before sharing them. */
export const reference: Record<
  "goodText" | "warnText" | "errorText" | "goodFill" | "errorFill",
  stylex.StyleXStyles
> = stylex.create({
  goodText: { color: "var(--console-ok)" },
  warnText: { color: "var(--console-warn)" },
  errorText: { color: "var(--console-err)" },
  goodFill: { fill: "var(--console-ok)" },
  errorFill: { fill: "var(--console-err)" },
});
