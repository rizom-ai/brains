import type { JSX } from "react";

/** A paper eye, lashes up, blinking now and then; its iris in any light. */
export function Eye({ iris }: { iris: string }): JSX.Element {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      {[
        "M46 30 L38 16",
        "M74 20 L70 6",
        "M100 17 L100 3",
        "M126 20 L130 6",
        "M154 30 L162 16",
      ].map((lash) => (
        <path
          key={lash}
          d={lash}
          stroke="var(--palette-ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
      <g className="tf-blink">
        <path
          d="M12 64 Q100 -2 188 64 Q100 130 12 64 Z"
          fill="var(--palette-card)"
          stroke="var(--palette-ink)"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <circle cx="100" cy="64" r="28" fill={iris} />
        <circle cx="100" cy="64" r="12" fill="var(--palette-ink)" />
        <circle cx="110" cy="54" r="6" fill="var(--palette-card)" />
      </g>
    </svg>
  );
}
