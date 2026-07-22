# @rizom/theme-signal

A high-contrast signal-lab theme for public Rover site packages.

The theme composes `@rizom/theme-default` and then replaces its type and color
register with a square-edged editorial system: bone paper, carbon ink, safety
orange actions, and cyan instrument traces. Light and dark modes are both
first-class, and decorative motion respects `prefers-reduced-motion`.

The package default-exports the complete CSS string expected by Rover's theme
resolver. Pair it with `@rizom/site-smoke-canary` at the same exact version for
the hosted package canary.
