/**
 * The console's layout conditions: every `@media` and `@container` rule in
 * the app controls, the operator renderer and Studio is one of these.
 *
 * StyleX needs the condition text written out where it is used — constants
 * cannot head a block-form at-rule, and constant at-rules lose StyleX's
 * ordering by width — so styles spell the condition literally and a test
 * holds every spelling to this list. Viewport rules hold the device
 * contract; `Host`, pane, cell, matrix and aside rules answer to the width
 * a block is given.
 */
export const consoleBreakpoints = {
  smallPhone: "@media (max-width: 420px)",
  phone: "@media (max-width: 640px)",
  compact: "@media (max-width: 720px)",
  tablet: "@media (max-width: 900px)",
  abovePhone: "@media (min-width: 641px)",
  tabletOnly: "@media (min-width: 641px) and (max-width: 900px)",
  desktop: "@media (min-width: 901px)",
  coarsePointer: "@media (pointer: coarse)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  phoneHost: "@container operator (max-width: 640px)",
  compactHost: "@container operator (max-width: 720px)",
  tabletHost: "@container operator (max-width: 900px)",
  narrowPane: "@container (max-width: 720px)",
  narrowCell: "@container operator-cell (max-width: 420px)",
  matrixPair:
    "@container operator-matrix (min-width: 481px) and (max-width: 900px)",
  matrixSingle: "@container operator-matrix (max-width: 480px)",
  inAside: "@container operator-aside (min-width: 0px)",
} as const;
