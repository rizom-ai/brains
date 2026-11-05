import type { JSX } from "react";

/** The stage light a dot or a keyhole is lit with. */
export type Light = "card" | "red" | "mint" | "mustard";

/**
 * How every act opens: a lit dot, the act's name and its label, then the
 * story's line in italics.
 */
export function ActHeading({
  act,
  label,
  opening,
  light,
}: {
  act: string;
  label: string;
  opening: string;
  light: Light;
}): JSX.Element {
  return (
    <div className="tf-act-heading tf-reveal">
      <div className="tf-act-line">
        <span className={`tf-dot tf-dot--${light}`} aria-hidden="true" />
        <span className="tf-act-name">{act}</span>
        <span className="tf-eyebrow">{label}</span>
      </div>
      <p className="tf-story">{opening}</p>
    </div>
  );
}

/** The torn paper edge where one act gives way to the next: paper or ink. */
export function TornEdge({
  tone = "paper",
}: {
  tone?: "paper" | "ink";
}): JSX.Element {
  return (
    <svg
      className={`tf-torn tf-torn--${tone}`}
      aria-hidden="true"
      viewBox="0 0 1440 36"
      preserveAspectRatio="none"
    >
      <polygon points="0,36 0,7 24,13 48,8 72,18 96,14 120,7 144,7 168,18 192,8 216,18 240,16 264,14 288,20 312,16 336,15 360,12 384,10 408,8 432,13 456,12 480,18 504,10 528,12 552,21 576,16 600,17 624,17 648,21 672,9 696,18 720,7 744,10 768,16 792,11 816,14 840,10 864,10 888,13 912,16 936,17 960,14 984,12 1008,21 1032,18 1056,15 1080,15 1104,8 1128,9 1152,7 1176,21 1200,19 1224,7 1248,17 1272,12 1296,17 1320,13 1344,11 1368,7 1392,9 1416,13 1440,17 1440,36" />
    </svg>
  );
}
