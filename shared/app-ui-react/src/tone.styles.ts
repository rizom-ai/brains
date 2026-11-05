import * as stylex from "@stylexjs/stylex";

/** The console's semantic tones; neutral keeps a surface's own colour. */
export type ConsoleTone = "neutral" | "good" | "warn" | "error";

const text = stylex.create({
  good: { color: "var(--console-ok)" },
  warn: { color: "var(--console-warn)" },
  error: { color: "var(--console-err)" },
});

const fill = stylex.create({
  good: { fill: "var(--console-ok)" },
  warn: { fill: "var(--console-warn)" },
  error: { fill: "var(--console-err)" },
});

/** Text in the tone's colour, or nothing for a neutral or missing tone. */
export function toneText(
  tone: ConsoleTone | undefined,
): stylex.StyleXStyles | false {
  return tone !== undefined && tone !== "neutral" && text[tone];
}

/** A mark filled in the tone's colour, or nothing for a neutral tone. */
export function toneFill(
  tone: ConsoleTone | undefined,
): stylex.StyleXStyles | false {
  return tone !== undefined && tone !== "neutral" && fill[tone];
}
