import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";

/**
 * The cover: a paper stage between two curtains, a red keyhole glowing in
 * the wall, a pocket watch and a key afloat. Scrolling parts the curtains
 * and steps through the keyhole into Act I (see ../styles).
 */
const coverSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string(),
  cue: z.string(),
});

/** Each word of the title on its own line, as the design sets it. */
function stacked(title: string): (string | JSX.Element)[] {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word, index) =>
      index === 0 ? [word] : [<br key={`br-${index}`} />, word],
    );
}

function Watch(): JSX.Element {
  // Twelve ticks from radius 30 to 25; the quarters are drawn heavier.
  const ticks = Array.from({ length: 12 }, (_, hour) => {
    const angle = (hour * Math.PI) / 6;
    const major = hour % 3 === 0;
    return (
      <line
        key={hour}
        x1={(60 + 30 * Math.sin(angle)).toFixed(1)}
        y1={(84 - 30 * Math.cos(angle)).toFixed(1)}
        x2={(60 + 25 * Math.sin(angle)).toFixed(1)}
        y2={(84 - 25 * Math.cos(angle)).toFixed(1)}
        stroke="currentColor"
        strokeWidth={major ? 3 : 1.4}
      />
    );
  });
  return (
    <svg viewBox="0 0 120 130" aria-hidden="true">
      <circle
        cx="60"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
      />
      <rect x="53" y="20" width="14" height="12" fill="currentColor" />
      <circle cx="60" cy="84" r="44" fill="currentColor" />
      <circle cx="60" cy="84" r="35" fill="var(--palette-card)" />
      {ticks}
      <g className="tf-hand">
        <line
          x1="60"
          y1="84"
          x2="60"
          y2="58"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="tf-hand tf-hand--slow">
        <line
          x1="60"
          y1="84"
          x2="76"
          y2="92"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <circle cx="60" cy="84" r="4" fill="currentColor" />
    </svg>
  );
}

function Key(): JSX.Element {
  return (
    <svg viewBox="0 0 170 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
      />
      <path
        d="M53 32 H162 M142 32 V54 M124 32 V48"
        stroke="currentColor"
        strokeWidth="9"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}

function CoverSection({
  eyebrow,
  title,
  subtitle,
  cue,
}: z.infer<typeof coverSchema>): JSX.Element {
  return (
    <section className="tf-cover" aria-label={title}>
      <div className="tf-stage">
        <div className="tf-room">
          <div className="tf-hole" aria-hidden="true">
            <div className="tf-glow">
              <div className="tf-keyhole tf-zoom" />
            </div>
          </div>
          <p className="tf-eyebrow tf-cover__eyebrow tf-fadeout">{eyebrow}</p>
          <h1 className="tf-cover__title tf-fadeout">{stacked(title)}</h1>
          <p className="tf-cover__subtitle tf-fadeout">{subtitle}</p>
          <p className="tf-cover__cue tf-fadeout">
            <span className="tf-eyebrow">{cue}</span>
            <span className="tf-bob" aria-hidden="true">
              ↓
            </span>
          </p>
          <div
            className="tf-curtain tf-curtain--left tf-cur-l"
            aria-hidden="true"
          />
          <div
            className="tf-curtain tf-curtain--right tf-cur-r"
            aria-hidden="true"
          />
          <div className="tf-valance tf-fadeout" aria-hidden="true" />
          <div className="tf-prop tf-prop--watch tf-fadeout" aria-hidden="true">
            <div className="tf-float">
              <Watch />
            </div>
          </div>
          <div className="tf-prop tf-prop--key tf-fadeout" aria-hidden="true">
            <div className="tf-float tf-float--late">
              <Key />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const cover: SectionDefinition = defineSection(
  coverSchema,
  CoverSection,
  {
    title: "Cover",
    description:
      "The title scene: the stage, its eyebrow, the title, the subtitle and the cue to scroll.",
  },
);

export const coverContent: JsonObject = {
  eyebrow: "A story in four acts",
  title: "The Fourth",
  subtitle: "or, How Hard-to-Explain Things Finally Got Understood",
  cue: "Step through",
} satisfies z.infer<typeof coverSchema>;
