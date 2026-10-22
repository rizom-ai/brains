import * as stylex from "@stylexjs/stylex";

export const selectionStyles: Record<"current", stylex.StyleXStyles> =
  stylex.create({
    // The open row of a list or table beside its detail: an accent edge on
    // a neutral tint. The card surface vanished on a board column of the
    // same colour, and an accent wash read as a warning on the dark climate.
    // Rows keep a gutter beside an open detail so the edge clears the text.
    current: {
      backgroundColor:
        "color-mix(in srgb, var(--console-text) 5%, transparent)",
      boxShadow: "inset 2px 0 0 var(--console-accent)",
    },
  });
