import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";
import { Eye } from "./eye";
import { TextLink } from "./links";

/**
 * Act III, enter the guide: The Fourth's three ways in, each a giant word on
 * a mint disc with its mark (an eye, a talking screen, a handset on its
 * cord), alternating sides, then the worlds it works in. Act I's "How it
 * works" lands here. Each way links to its program once the program has a
 * page; the worlds are labels until they have pages of their own.
 */
const guideSpellSchema = z.object({
  word: z.string(),
  name: z.string(),
  text: z.string(),
  mark: z.enum(["eye", "screen", "handset"]),
  link: z.object({ label: z.string(), href: z.string().default("") }),
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

function MintEye(): JSX.Element {
  return <Eye iris="var(--palette-mint)" />;
}

/** An old television, its mouth on the red screen talking. */
function Screen(): JSX.Element {
  return (
    <svg viewBox="0 0 180 190" aria-hidden="true">
      <path
        d="M62 12 L88 44 M124 6 L94 44"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="8" y="44" width="164" height="124" rx="22" fill="currentColor" />
      <rect
        x="24"
        y="60"
        width="104"
        height="92"
        rx="16"
        fill="var(--palette-red)"
      />
      <g className="tf-talk">
        <rect
          x="44"
          y="92"
          width="64"
          height="9"
          rx="4.5"
          fill="var(--palette-card)"
        />
        <rect
          x="44"
          y="110"
          width="44"
          height="9"
          rx="4.5"
          fill="var(--palette-card)"
        />
      </g>
      <circle cx="150" cy="84" r="8" fill="var(--palette-card)" />
      <circle cx="150" cy="112" r="8" fill="var(--palette-card)" />
      <rect x="30" y="168" width="14" height="16" fill="currentColor" />
      <rect x="136" y="168" width="14" height="16" fill="currentColor" />
    </svg>
  );
}

/** A red handset hanging from its coiled cord. */
function Handset(): JSX.Element {
  return (
    <svg viewBox="0 0 120 220" aria-hidden="true">
      <path
        d="M60 0 L60 10 Q 74 14.5 60 19 Q 46 23.5 60 28 Q 74 32.5 60 37 Q 46 41.5 60 46 Q 74 50.5 60 55 Q 46 59.5 60 64 Q 74 68.5 60 73 Q 46 77.5 60 82 Q 74 86.5 60 91 Q 46 95.5 60 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <g transform="translate(60 112) rotate(-14)">
        <path
          d="M-20 -6 C-26 30 -26 60 -20 92"
          fill="none"
          stroke="var(--palette-red)"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <ellipse cx="-4" cy="-8" rx="28" ry="18" fill="var(--palette-red)" />
        <ellipse cx="-4" cy="96" rx="28" ry="18" fill="var(--palette-red)" />
        <circle
          cx="-4"
          cy="-8"
          r="5"
          fill="var(--palette-card)"
          opacity="0.55"
        />
        <circle
          cx="-4"
          cy="96"
          r="5"
          fill="var(--palette-card)"
          opacity="0.55"
        />
      </g>
    </svg>
  );
}

const MARKS: Record<Mark, () => JSX.Element> = {
  eye: MintEye,
  screen: Screen,
  handset: Handset,
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
    <section id="guide" className="tf-act tf-act--three">
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
                <div
                  className={spell.mark === "handset" ? "tf-swing" : undefined}
                >
                  <MarkDrawing />
                </div>
              </div>
              <div className="tf-guide-spell__text">
                <span className="tf-eyebrow">{spell.name}</span>
                <span>{spell.text}</span>
                {spell.link.href && (
                  <TextLink
                    link={{ label: spell.link.label, href: spell.link.href }}
                  />
                )}
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
      "The guide's three ways in (word, name, text, mark: eye, screen or handset, and the program's link, shown once it has an href) and the worlds The Fourth works in, each with its light.",
  },
);

export const actThreeContent: JsonObject = {
  act: "Act III",
  label: "Enter the guide",
  opening: "Then, a slightly strange guide appeared, with three ways in.",
  intro:
    "See it clearly, tell it well, reach the people who matter. In that order.",
  spells: [
    {
      word: "See.",
      name: "The fourth dimension",
      text: "A new angle on what you already have. Our Communication Diagnosis, built on ContentDNA™.",
      mark: "eye",
      link: { label: "Communication Diagnosis →", href: "" },
    },
    {
      word: "Tell.",
      name: "The fourth act",
      text: "The story, in the order your audience thinks. We hand your team the plan.",
      mark: "screen",
      link: { label: "Positioning & Playbook →", href: "" },
    },
    {
      word: "Reach.",
      name: "The fourth wall",
      text: "The right voices for your message, chosen for fit, not follower count.",
      mark: "handset",
      link: { label: "Creator Match →", href: "" },
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
