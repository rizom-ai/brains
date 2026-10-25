import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";

/**
 * Act III, enter the guide: The Fourth's three spells, each a giant word on
 * a mint disc with its mark (a magnifying glass, a lantern, a paper plane),
 * alternating sides, then the worlds it works in. The worlds are labels
 * until they have pages of their own.
 */
const guideSpellSchema = z.object({
  word: z.string(),
  name: z.string(),
  text: z.string(),
  mark: z.enum(["glass", "lantern", "plane"]),
});

const sectorSchema = z.object({
  label: z.string(),
  light: z.enum(["red", "mint", "mustard", "ink"]),
});

const actThreeSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  intro: z.string(),
  spells: z.array(guideSpellSchema),
  sectorsPrompt: z.string(),
  sectors: z.array(sectorSchema),
});

type Mark = z.infer<typeof guideSpellSchema>["mark"];

function Glass(): JSX.Element {
  return (
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <circle
        cx="56"
        cy="56"
        r="40"
        fill="var(--palette-card)"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth="12"
      />
      <path
        d="M86 86 L130 130"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Lantern(): JSX.Element {
  return (
    <svg viewBox="0 0 100 170" aria-hidden="true">
      <circle
        cx="50"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path d="M28 34 H72 L64 22 H36Z" fill="currentColor" />
      <rect x="22" y="34" width="56" height="8" fill="currentColor" />
      <rect
        className="tf-flicker"
        x="30"
        y="44"
        width="40"
        height="86"
        fill="var(--palette-straw)"
      />
      <path
        d="M30 44 V130 M50 44 V130 M70 44 V130"
        stroke="currentColor"
        strokeWidth="5"
      />
      <rect
        x="26"
        y="42"
        width="48"
        height="90"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
      />
      <path d="M20 132 H80 L72 150 H28Z" fill="currentColor" />
    </svg>
  );
}

function Plane(): JSX.Element {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true">
      <polygon points="2,52 158,2 60,96 52,64" fill="currentColor" />
      <polygon points="52,64 158,2 72,70" fill="var(--palette-ink-subtle)" />
      <polygon points="60,96 72,70 52,64" fill="var(--palette-ink-muted)" />
    </svg>
  );
}

const MARKS: Record<Mark, () => JSX.Element> = {
  glass: Glass,
  lantern: Lantern,
  plane: Plane,
};

function ActThreeSection({
  act,
  label,
  opening,
  intro,
  spells,
  sectorsPrompt,
  sectors,
}: z.infer<typeof actThreeSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--three">
      <div className="tf-wrap tf-act-three">
        <div className="tf-act-three__top">
          <ActHeading act={act} label={label} opening={opening} light="mint" />
          <p className="tf-act-three__intro tf-reveal">{intro}</p>
        </div>
        {spells.map((spell, index) => {
          const MarkDrawing = MARKS[spell.mark];
          return (
            <div
              key={spell.word}
              className={
                index % 2 === 1
                  ? "tf-guide-spell tf-guide-spell--mirrored"
                  : "tf-guide-spell"
              }
            >
              <div className="tf-guide-spell__disc tf-l1" aria-hidden="true" />
              <span className="tf-guide-spell__word">{spell.word}</span>
              <div
                className={`tf-guide-spell__mark tf-mark--${spell.mark} tf-l3`}
                aria-hidden="true"
              >
                <MarkDrawing />
              </div>
              <div className="tf-guide-spell__text">
                <span className="tf-eyebrow">{spell.name}</span>
                <span>{spell.text}</span>
              </div>
            </div>
          );
        })}
        <div className="tf-sectors tf-reveal">
          <span className="tf-story">{sectorsPrompt}</span>
          <ul className="tf-sectors__list">
            {sectors.map((sector) => (
              <li key={sector.label} className="tf-chip">
                <span
                  className={`tf-chip__dot tf-chip__dot--${sector.light}`}
                  aria-hidden="true"
                />
                {sector.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export const actThree: SectionDefinition = defineSection(
  actThreeSchema,
  ActThreeSection,
  {
    title: "Act III — Enter the guide",
    description:
      "The guide's three spells (word, name, text and mark: glass, lantern or plane) and the worlds The Fourth works in, each with its light.",
  },
);

export const actThreeContent: JsonObject = {
  act: "Act III",
  label: "Enter the guide",
  opening: "Then, a slightly strange guide appeared.",
  intro:
    "Every hero gets one. Ours knows three spells, and casts them in this order:",
  spells: [
    {
      word: "See.",
      name: "The fourth dimension",
      text: "A new angle on what you already have. Our Communication Diagnosis, built on ContentDNA™.",
      mark: "glass",
    },
    {
      word: "Tell.",
      name: "The fourth act",
      text: "The story, in the order your audience thinks. We hand your team the plan.",
      mark: "lantern",
    },
    {
      word: "Reach.",
      name: "The fourth wall",
      text: "The right voices for your message, chosen for fit, not follower count.",
      mark: "plane",
    },
  ],
  sectorsPrompt: "Which world are you from?",
  sectors: [
    { label: "Sustainability & Impact", light: "mint" },
    { label: "Tech & AI", light: "red" },
    { label: "Silver Care", light: "mustard" },
    { label: "Art & Culture", light: "ink" },
    { label: "Creators", light: "red" },
  ],
} satisfies z.input<typeof actThreeSchema>;
