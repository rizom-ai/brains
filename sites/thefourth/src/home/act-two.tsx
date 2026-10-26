import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";
import { KEY_SHAPES, KeyDrawing } from "./keys";
import { ButtonLink, linkSchema } from "./links";

/**
 * Act II, the curse of jargon: a true sentence nobody listened to. "Unlock
 * it" scatters its words, strikes out the jargon and opens a keyhole onto
 * the translation, lit in the spell's color; from there the visitor can
 * unlock their own by email or try another. The page renders the first spell; the spell script (see
 * ./spell-script) does the breaking.
 */
const spellSchema = z.object({
  before: z.string(),
  jargon: z.array(z.string()),
  main: z.string(),
  sub: z.string(),
  sector: z.string(),
  light: z.enum(["red", "mint", "mustard"]),
});

const actTwoSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  unlockLabel: z.string(),
  aside: z.string(),
  translationLead: z.string(),
  action: linkSchema,
  againLabel: z.string(),
  spells: z.array(spellSchema).min(1),
});

type Spell = z.infer<typeof spellSchema>;

/** A spell's position, as the design counts it: 01/03. */
export function spellCounter(index: number, total: number): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(index + 1)}/${pad(total)}`;
}

function Words({ spell }: { spell: Spell }): JSX.Element {
  const words = spell.before.split(" ");
  const jargon = new Set(spell.jargon.map((word) => word.toLowerCase()));
  return (
    <p className="tf-spell__words" aria-label={spell.before}>
      {words.map((word, index) => (
        <span
          key={`${index}-${word}`}
          aria-hidden="true"
          className="tf-word"
          data-jargon={jargon.has(word.toLowerCase()) ? "true" : "false"}
        >
          {index < words.length - 1 ? `${word} ` : word}
        </span>
      ))}
    </p>
  );
}

/** JSON for an inline script element, with no way to close it early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function ActTwoSection({
  act,
  label,
  opening,
  unlockLabel,
  aside,
  translationLead,
  action,
  againLabel,
  spells,
}: z.infer<typeof actTwoSchema>): JSX.Element {
  const first = spells[0];
  // The schema holds at least one spell; this only satisfies the index type.
  if (!first) return <section className="tf-act tf-act--two" />;
  return (
    <section className="tf-act tf-act--two">
      <div className="tf-wrap tf-act-two__top">
        <ActHeading act={act} label={label} opening={opening} light="mustard" />
      </div>
      <div className="tf-spell" data-tf-spell="">
        <script
          type="application/json"
          data-tf-spells=""
          dangerouslySetInnerHTML={{ __html: scriptJson(spells) }}
        />
        <div className="tf-wrap tf-spell__stage">
          <Words spell={first} />
          <div className="tf-spell__actions">
            <button
              type="button"
              className="tf-btn tf-btn--ink tf-btn--large"
              data-tf-break=""
            >
              <span className="tf-btn__key" aria-hidden="true">
                <KeyDrawing shape={KEY_SHAPES.ring} />
              </span>
              {unlockLabel}
            </button>
            <span className="tf-story tf-aside">{aside}</span>
          </div>
        </div>
        <div className="tf-spell__after" data-light={first.light}>
          <div className="tf-spell__key" />
          <div className="tf-wrap tf-spell__translation">
            <span className="tf-story tf-land">{translationLead}</span>
            <p className="tf-spell__main tf-land" data-tf-main="">
              {first.main}
            </p>
            <p className="tf-story tf-spell__sub tf-land" data-tf-sub="">
              {first.sub}
            </p>
            <div className="tf-spell__again tf-land">
              <ButtonLink link={action} tone="ink" />
              <button
                type="button"
                className="tf-btn tf-btn--card"
                data-tf-next=""
              >
                {againLabel}
              </button>
              <span className="tf-eyebrow" data-tf-counter="">
                {`${first.sector} · ${spellCounter(0, spells.length)}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const actTwo: SectionDefinition = defineSection(
  actTwoSchema,
  ActTwoSection,
  {
    title: "Act II — The curse of jargon",
    description:
      "The jargon translator: the act's words, the button labels, the action after the translation and the spells, each a jargon sentence, the words to strike, the translation, its sector and its light (red, mint or mustard).",
  },
);

export const actTwoContent: JsonObject = {
  act: "Act II",
  label: "The curse of jargon",
  opening: "But when you told the world, it sounded like this:",
  unlockLabel: "Unlock it",
  aside: "Smart. True. And nobody listened.",
  translationLead: "So we translated it into what they needed to hear:",
  action: { label: "Unlock yours →", href: "mailto:nihao.fourth@gmail.com" },
  againLabel: "Try another ↻",
  spells: [
    {
      before:
        "We apply Transactive Memory Systems to diagnose knowledge distribution and routing across teams.",
      jargon: [
        "transactive",
        "memory",
        "systems",
        "diagnose",
        "knowledge",
        "distribution",
        "routing",
      ],
      main: "If your most experienced person left tomorrow, what would your team forget?",
      sub: "We find out before it happens.",
      sector: "Tech & AI",
      light: "red",
    },
    {
      before:
        "The exhibition investigates interspecies entanglement and aerosolar commons through suspended filament architectures.",
      jargon: [
        "investigates",
        "interspecies",
        "entanglement",
        "aerosolar",
        "commons",
        "suspended",
        "filament",
        "architectures.",
      ],
      main: "Spiders were building cities long before we were.",
      sub: "Come see what they know.",
      sector: "Art & Culture",
      light: "mint",
    },
    {
      before:
        "We reduced Scope 3 emissions intensity through supplier engagement and LCA-based material substitution.",
      jargon: [
        "scope",
        "3",
        "emissions",
        "intensity",
        "supplier",
        "engagement",
        "lca-based",
        "substitution.",
      ],
      main: "Your buyer in Berlin wants proof your product is cleaner.",
      sub: "We make that proof readable in ten seconds.",
      sector: "Sustainability & Impact",
      light: "mustard",
    },
  ],
} satisfies z.input<typeof actTwoSchema>;
