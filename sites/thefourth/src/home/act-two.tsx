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
 * ./spell-script) does the breaking. In Chinese the old copy sits on a card
 * beside the good copy, locked behind a keyhole with a prompt and a hint, and
 * the translation opens under the old sentence, struck out.
 */
const spellSchema = z.object({
  before: z.string(),
  /**
   * The sentence's words, for a language that writes without spaces
   * (Chinese); left empty, the sentence is split at its spaces.
   */
  words: z.array(z.string()).default([]),
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
  /** Chinese only: the pills naming the old copy and the good copy. */
  beforeLabel: z.string().default(""),
  afterLabel: z.string().default(""),
  /** Chinese only: the locked panel's prompt (its lines kept) and hint. */
  unlockPrompt: z.string().default(""),
  unlockHint: z.string().default(""),
});

type Spell = z.infer<typeof spellSchema>;

/** A spell's position, as the design counts it: 01/03. */
export function spellCounter(index: number, total: number): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(index + 1)}/${pad(total)}`;
}

/** The words a spell scatters: as listed, else split at the spaces. */
function wordsOf(spell: Spell): Array<{ word: string; text: string }> {
  if (spell.words.length > 0) {
    return spell.words.map((word) => ({ word, text: word }));
  }
  const parts = spell.before.split(" ");
  return parts.map((word, index) => ({
    word,
    text: index < parts.length - 1 ? `${word} ` : word,
  }));
}

function Words({ spell }: { spell: Spell }): JSX.Element {
  const jargon = new Set(spell.jargon.map((word) => word.toLowerCase()));
  return (
    <p className="tf-spell__words" aria-label={spell.before}>
      {wordsOf(spell).map(({ word, text }, index) => (
        <span
          key={`${index}-${word}`}
          aria-hidden="true"
          className="tf-word"
          data-jargon={jargon.has(word.toLowerCase()) ? "true" : "false"}
        >
          {text}
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
}: ActTwo): JSX.Element {
  const first = spells[0];
  // The schema holds at least one spell; this only satisfies the index type.
  if (!first) return <section className="tf-act tf-act--two" />;
  return (
    <section className="tf-act tf-act--two">
      <div className="tf-wrap tf-act-two__top">
        <ActHeading act={act} label={label} opening={opening} light="mustard" />
      </div>
      <div className="tf-spell" data-tf-spell="">
        <SpellData spells={spells} />
        <div className="tf-wrap tf-spell__stage">
          <Words spell={first} />
          <div className="tf-spell__actions">
            <UnlockButton
              label={unlockLabel}
              className="tf-btn tf-btn--ink tf-btn--large"
            />
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

type ActTwo = z.infer<typeof actTwoSchema>;

function SpellData({ spells }: { spells: Spell[] }): JSX.Element {
  return (
    <script
      type="application/json"
      data-tf-spells=""
      dangerouslySetInnerHTML={{ __html: scriptJson(spells) }}
    />
  );
}

function UnlockButton({
  label,
  className,
}: {
  label: string;
  className: string;
}): JSX.Element {
  return (
    <button type="button" className={className} data-tf-break="">
      <span className="tf-btn__key" aria-hidden="true">
        <KeyDrawing shape={KEY_SHAPES.ring} />
      </span>
      {label}
    </button>
  );
}

/** Act II in Chinese: the old copy on a card, the good copy locked beside it. */
function ActTwoChinese({
  act,
  label,
  opening,
  unlockLabel,
  aside,
  translationLead,
  action,
  againLabel,
  spells,
  beforeLabel,
  afterLabel,
  unlockPrompt,
  unlockHint,
}: ActTwo): JSX.Element {
  const first = spells[0];
  if (!first) return <section className="tf-act tf-act--two" />;
  const counter = `${first.sector} · ${spellCounter(0, spells.length)}`;
  return (
    <section className="tf-act tf-act--two">
      <div className="tf-wrap tf-act-two__top">
        <ActHeading act={act} label={label} opening={opening} light="mustard" />
      </div>
      <div className="tf-spell" data-tf-spell="">
        <SpellData spells={spells} />
        <div className="tf-wrap tf-spell__stage">
          <div className="tf-spell__old">
            <div className="tf-spell__meta">
              <span className="tf-pill tf-pill--old">{beforeLabel}</span>
              <span className="tf-spell__note">
                <span data-tf-counter="">{counter}</span>
                {"\u3000"}
                {aside}
              </span>
            </div>
            <Words spell={first} />
          </div>
          <div className="tf-spell__new">
            <span className="tf-pill tf-pill--new">{afterLabel}</span>
            <span className="tf-spell__lock" aria-hidden="true" />
            <p className="tf-spell__prompt">{unlockPrompt}</p>
            <div className="tf-spell__actions">
              <UnlockButton
                label={unlockLabel}
                className="tf-btn tf-btn--ink tf-btn--large tf-btn--unlock"
              />
              <span className="tf-spell__hint">{unlockHint}</span>
            </div>
          </div>
        </div>
        <div className="tf-spell__after" data-light={first.light}>
          <div className="tf-spell__key" />
          <div className="tf-wrap tf-spell__translation">
            <div className="tf-spell__lead tf-land">
              <span className="tf-spell__was">
                <strong>{`${beforeLabel}：`}</strong>
                <span className="tf-spell__struck" data-tf-before="">
                  {first.before}
                </span>
              </span>
              <div className="tf-spell__meta">
                <span className="tf-pill tf-pill--new">{afterLabel}</span>
                <span className="tf-spell__lead-text">{translationLead}</span>
              </div>
            </div>
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
                {counter}
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
    components: { "zh-TW": ActTwoChinese },
    title: "Act II — The curse of jargon",
    description:
      "The jargon translator: the act's words, the button labels, the action after the translation and the spells, each a jargon sentence (with its words listed for a language written without spaces), the words to strike, the translation, its sector and its light (red, mint or mustard). Chinese pages also name the old and the good copy (before and after labels) and give the locked panel a prompt and a hint.",
  },
);

export const actTwoContent: JsonObject = {
  act: "Act II",
  label: "The curse of jargon",
  opening: "But when you told the world, it sounded like this:",
  unlockLabel: "Unlock it",
  aside: "Smart. True. And nobody listened.",
  translationLead: "So we translated it into what they needed to hear:",
  action: { label: "Unlock yours →", href: "/work-with-us" },
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
