import { Fragment, type JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import { linkSchema, type Link } from "../home/links";
import {
  Dot,
  Label,
  lightSchema,
  PageWrap,
  pageRoute,
  stagedIntro,
  statSchema,
  type Light,
} from "./common";
import { KEY_SHAPES, KeyDrawing } from "../home/keys";

/**
 * How The Fourth works, told through one case: the figure that made people
 * ask, the four moves behind it, the shape every project follows, the two
 * methods (Seamless Communication and ContentDNA™), and what that means for
 * the visitor. Sam's Chinese page tells it without the case: the pattern as
 * a track of four steps, the methods drawn as a comparison and a flow, and
 * what it means as three circles round a promise.
 */
const lightLinkSchema = linkSchema.extend({ light: lightSchema });

/** A pill that points down the page to the method behind a move. */
function MethodPill({
  link,
}: {
  link: z.infer<typeof lightLinkSchema>;
}): JSX.Element {
  return (
    <a className="tf-pill" href={link.href}>
      <Dot light={link.light} />
      {link.label}
    </a>
  );
}

/** A colored rule over a link to the method it names. */
function RuleLink({
  link,
}: {
  link: z.infer<typeof lightLinkSchema>;
}): JSX.Element {
  return (
    <a className="tf-rule-link" href={link.href}>
      <span className={`tf-rule-link__rule tf-bar-mark--${link.light}`} />
      <span>{link.label}</span>
    </a>
  );
}

const caseSchema = z.object({
  stat: z.string(),
  statLabel: z.string(),
  label: z.string(),
  text: z.string(),
  question: z.string(),
  more: linkSchema,
});

function CaseSection(props: z.infer<typeof caseSchema>): JSX.Element {
  return (
    <section className="tf-howcase">
      <PageWrap className="tf-howcase__inner">
        <div className="tf-stack">
          <span className="tf-howcase__stat">{props.stat}</span>
          <span className="tf-howcase__label">{props.statLabel}</span>
        </div>
        <div className="tf-stack tf-stack--loose">
          <span className="tf-plabel tf-plabel--pale">{props.label}</span>
          <p className="tf-howcase__text">{props.text}</p>
          <p className="tf-howcase__question">{props.question}</p>
          <a className="tf-link" href={props.more.href}>
            {props.more.label}
          </a>
        </div>
      </PageWrap>
    </section>
  );
}

export const howCase: SectionDefinition = defineSection(
  caseSchema,
  CaseSection,
  {
    components: { "zh-TW": NoCase },
    title: "How — the case",
    description:
      "The case the page tells: the figure and what it counts, the label, the situation, the question it raises and the link down to the answer.",
  },
);

const storySchema = z.object({
  label: z.string(),
  headline: z.string(),
  moves: z.array(
    z.object({
      light: lightSchema,
      title: z.string(),
      text: z.string(),
      method: lightLinkSchema,
    }),
  ),
  quote: z.object({ text: z.string(), by: z.string() }),
  aside: z.object({ title: z.string(), text: z.string() }),
});

function StorySection({
  label,
  headline,
  moves,
  quote,
  aside,
}: z.infer<typeof storySchema>): JSX.Element {
  return (
    <section id="story">
      <PageWrap className="tf-band__inner tf-story-band">
        <div className="tf-stack">
          <Label>{label}</Label>
          <h2 className="tf-h2 tf-h2--small tf-reveal">{headline}</h2>
        </div>
        <ol className="tf-moves">
          {moves.map((move, index) => (
            <li key={move.title} className="tf-move">
              <span className={`tf-move__number tf-pdot--${move.light}`}>
                {index + 1}
              </span>
              <div className="tf-move__words">
                <h3 className="tf-move__title">{move.title}</h3>
                <p className="tf-body">{move.text}</p>
                <MethodPill link={move.method} />
              </div>
            </li>
          ))}
        </ol>
        <figure className="tf-case__quote tf-story-band__quote">
          <blockquote>{quote.text}</blockquote>
          <figcaption>{quote.by}</figcaption>
        </figure>
        <div className="tf-pcard tf-aha">
          <span className="tf-aha__title">{aside.title}</span>
          <p className="tf-body">{aside.text}</p>
        </div>
      </PageWrap>
    </section>
  );
}

export const story: SectionDefinition = defineSection(
  storySchema,
  StorySection,
  {
    components: { "zh-TW": NoCase },
    title: "How — the four moves",
    description:
      "The case step by step: the label and headline, each move (light, title, text and the pill to its method: label, link, light), the client's quote and the closing aside (title and text).",
  },
);

/** Chinese only: a step's name on the track, and its small English tag. */
const trackNameShape = {
  name: z.string().default(""),
  tag: z.string().default(""),
};

const patternSchema = z.object({
  label: z.string(),
  headline: z.string(),
  diagramLabel: z.string(),
  steps: z.array(
    z.object({ title: z.string(), text: z.string(), ...trackNameShape }),
  ),
  gather: lightLinkSchema,
  reach: z.object({ title: z.string(), text: z.string(), ...trackNameShape }),
  rings: z.object({
    story: z.string(),
    creators: z.string(),
    audiences: z.string(),
    beyond: z.string(),
  }),
  reachLink: lightLinkSchema,
  /** Chinese only: the fourth step, the promise, and its link. */
  promise: z
    .object({
      title: z.string(),
      text: z.string(),
      ...trackNameShape,
      link: lightLinkSchema,
    })
    .default({
      title: "",
      text: "",
      name: "",
      tag: "",
      link: { label: "", href: "", light: "ink" },
    }),
  /** Chinese only: the line under the track that sends it round again. */
  repeat: z
    .object({ label: z.string(), text: z.string() })
    .default({ label: "", text: "" }),
});

function Handset(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 34 34"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="16" height="30" rx="3" />
      <path d="M15 27 h4" />
    </svg>
  );
}

function PatternSection(props: z.infer<typeof patternSchema>): JSX.Element {
  const { rings } = props;
  return (
    <section className="tf-pattern">
      <PageWrap className="tf-pattern__inner">
        <div className="tf-stack">
          <Label>{props.label}</Label>
          <h2 className="tf-pattern__headline tf-reveal">{props.headline}</h2>
        </div>
        <figure
          className="tf-pattern__figure"
          role="group"
          aria-label={props.diagramLabel}
        >
          <div className="tf-howgrid">
            <div className="tf-stack tf-stack--loose">
              <ol className="tf-shape">
                {props.steps.map((step, index) => (
                  <li key={step.title} className="tf-shape__step">
                    <span className="tf-shape__number">{index + 1}</span>
                    <span className="tf-shape__words">
                      <span className="tf-shape__title">{step.title}</span>
                      <span className="tf-shape__text">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <RuleLink link={props.gather} />
            </div>
            <span className="tf-into" aria-hidden="true">
              →
            </span>
            <div className="tf-stack tf-stack--loose">
              <div className="tf-shape__reach">
                <span className="tf-shape__number tf-shape__number--mint">
                  {props.steps.length + 1}
                </span>
                <span className="tf-shape__words">
                  <span className="tf-shape__big">{props.reach.title}</span>
                  <span className="tf-shape__text">{props.reach.text}</span>
                </span>
              </div>
              <div className="tf-rings" aria-hidden="true">
                <span className="tf-ring tf-ring--3" />
                <span className="tf-ring tf-ring--2" />
                <span className="tf-ring tf-ring--1" />
                <span className="tf-ring tf-ring--pulse" />
                <span className="tf-ring tf-ring--pulse tf-ring--later" />
                <span className="tf-rings__story">{rings.story}</span>
                <span className="tf-ringlabel tf-ringlabel--creators">
                  <span className="tf-ringlabel__phones">
                    <Handset />
                    <Handset />
                    <Handset />
                  </span>
                  {rings.creators}
                </span>
                <span className="tf-ringlabel tf-ringlabel--audiences">
                  {rings.audiences}
                </span>
                <span className="tf-ringlabel tf-ringlabel--beyond">
                  {rings.beyond}
                </span>
              </div>
              <ul className="tf-legend">
                <li>● {rings.creators}</li>
                <li className="tf-legend--audiences">● {rings.audiences}</li>
                <li className="tf-legend--beyond">● {rings.beyond}</li>
              </ul>
              <RuleLink link={props.reachLink} />
            </div>
          </div>
        </figure>
      </PageWrap>
    </section>
  );
}

export const pattern: SectionDefinition = defineSection(
  patternSchema,
  PatternSection,
  {
    components: { "zh-TW": PatternChinese },
    title: "How — the pattern",
    description:
      "The shape of every project: label, headline, the diagram's name for screen readers, the steps that get the story right (title and text), the link to the method behind them, the reach step (title and text), the rings' words (the story, matched creators, their audiences, people beyond) and the link to the method behind the reach.",
  },
);

const chainSchema = z.object({
  label: z.string(),
  links: z.array(z.string()),
  lead: z.string().default(""),
  note: z.string(),
  /** Chinese only: a line under the label, and the stage of each link. */
  sub: z.string().default(""),
  stages: z.array(z.string()).default([]),
});

/** Chinese only: one creator seen by a usual platform and by ContentDNA. */
const compareSchema = z.object({
  label: z.string(),
  badge: z.string(),
  creator: z.object({
    initial: z.string(),
    name: z.string(),
    meta: z.string(),
  }),
  usual: z.object({ label: z.string(), stats: z.array(statSchema) }),
  ours: z.object({
    label: z.string(),
    layers: z.array(
      z.object({
        label: z.string(),
        light: lightSchema,
        tags: z.array(z.string()),
      }),
    ),
  }),
  rows: z.array(
    z.object({ label: z.string(), usual: z.string(), ours: z.string() }),
  ),
});

/** Chinese only: what goes into ContentDNA and what comes out. */
const flowSchema = z.object({
  title: z.string(),
  inputs: z.array(z.object({ title: z.string(), text: z.string() })),
  into: z.string(),
  engine: z.string(),
  out: z.string(),
  outputs: z.array(z.object({ title: z.string(), text: z.string() })),
});

const methodSchema = z.object({
  id: z.string(),
  label: z.string(),
  headline: z.string(),
  /** Chinese only: the method's name in Chinese, beside the English. */
  gloss: z.string().default(""),
  tagline: z.string(),
  points: z.array(z.object({ strong: z.string(), text: z.string() })),
  chainsLabel: z.string().default(""),
  chains: z.array(chainSchema).default([]),
  match: z
    .object({
      label: z.string(),
      layer: z.string(),
      left: z.string(),
      right: z.string(),
      rows: z.array(
        z.object({ layer: z.string(), left: z.string(), right: z.string() }),
      ),
      resultLabel: z.string(),
      result: z.string(),
    })
    .default({
      label: "",
      layer: "",
      left: "",
      right: "",
      rows: [],
      resultLabel: "",
      result: "",
    }),
  /** Chinese only: the chains' caption, the word between links, the unit. */
  chainsNote: z.string().default(""),
  handoff: z.string().default(""),
  chainsUnit: z.string().default(""),
  compare: compareSchema.nullable().default(null),
  flow: flowSchema.nullable().default(null),
});

type Chain = z.infer<typeof chainSchema>;

function ChainRow({ chain }: { chain: Chain }): JSX.Element {
  return (
    <div className={chain.lead ? "tf-chain" : "tf-chain tf-chain--usual"}>
      <span className="tf-plabel tf-plabel--muted">{chain.label}</span>
      <div className="tf-chain__links">
        {[chain.lead, ...chain.links].filter(Boolean).flatMap((link, index) => [
          ...(index > 0
            ? [
                <span
                  key={`to-${index}`}
                  className="tf-chain__arrow"
                  aria-hidden="true"
                >
                  →
                </span>,
              ]
            : []),
          <span
            key={link}
            className={
              link === chain.lead
                ? "tf-chain__link tf-chain__link--lead"
                : "tf-chain__link"
            }
          >
            {link}
          </span>,
        ])}
      </div>
      <p className="tf-chain__note">{chain.note}</p>
    </div>
  );
}

function MethodSection(props: z.infer<typeof methodSchema>): JSX.Element {
  const { match } = props;
  return (
    <section id={props.id} className="tf-band">
      <PageWrap className="tf-band__inner tf-split tf-method">
        <div className="tf-stack tf-stack--loose">
          <Label>{props.label}</Label>
          <h2 className="tf-h2 tf-h2--small tf-reveal">{props.headline}</h2>
          <p className="tf-method__tagline">{props.tagline}</p>
          {match.rows.length > 0 && <Points points={props.points} />}
        </div>
        <div className="tf-stack tf-stack--loose">
          {match.rows.length === 0 && <Points points={props.points} />}
          {props.chains.length > 0 && (
            <figure
              className="tf-chains"
              role="group"
              aria-label={props.chainsLabel}
            >
              {props.chains.map((chain) => (
                <ChainRow key={chain.label} chain={chain} />
              ))}
            </figure>
          )}
          {match.rows.length > 0 && (
            <div className="tf-match" role="table" aria-label={match.label}>
              <span className="tf-plabel tf-plabel--light">{match.label}</span>
              <div className="tf-match__row tf-match__row--head" role="row">
                <span className="tf-match__layer" role="columnheader">
                  {match.layer}
                </span>
                <span
                  className="tf-match__left tf-match__name"
                  role="columnheader"
                >
                  {match.left}
                </span>
                <span className="tf-match__arrow" aria-hidden="true" />
                <span
                  className="tf-match__right tf-match__name"
                  role="columnheader"
                >
                  {match.right}
                </span>
              </div>
              {match.rows.map((row) => (
                <div key={row.layer} className="tf-match__row" role="row">
                  <span className="tf-match__layer" role="rowheader">
                    {row.layer}
                  </span>
                  <span className="tf-match__left" role="cell">
                    {row.left}
                  </span>
                  <span className="tf-match__arrow" aria-hidden="true">
                    ↔
                  </span>
                  <span className="tf-match__right" role="cell">
                    {row.right}
                  </span>
                </div>
              ))}
              <p className="tf-match__result">
                <strong>{match.resultLabel}</strong> {match.result}
              </p>
            </div>
          )}
        </div>
      </PageWrap>
    </section>
  );
}

function Points({
  points,
}: {
  points: Array<{ strong: string; text: string }>;
}): JSX.Element {
  return (
    <ul className="tf-points">
      {points.map((point, index) => (
        <li key={point.strong}>
          <span className="tf-points__n">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>
            <strong>{point.strong}</strong> {point.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const method: SectionDefinition = defineSection(
  methodSchema,
  MethodSection,
  {
    components: { "zh-TW": MethodChinese },
    title: "How — a method",
    description:
      "A method behind the work: its anchor id, label, headline, tagline and numbered points (bold lead and text), then either handoff chains compared (their name for screen readers; each a label, an optional lead link, the links and a note) or a match shown as a table (label, column names, rows of layer, left and right, and the result).",
  },
);

const benefitsSchema = z.object({
  label: z.string(),
  /** Chinese only: the headline, the line under it, and the promise. */
  headline: z.string().default(""),
  tagline: z.string().default(""),
  center: z.string().default(""),
  proofLabel: z.string(),
  items: z.array(
    z.object({
      light: lightSchema,
      title: z.string(),
      tagline: z.string(),
      proof: z.string(),
      proofBy: z.string().default(""),
      proofLink: linkSchema.default({ label: "", href: "" }),
      behind: linkSchema,
    }),
  ),
});

function BenefitsSection({
  label,
  proofLabel,
  items,
}: z.infer<typeof benefitsSchema>): JSX.Element {
  return (
    <section className="tf-band">
      <PageWrap className="tf-band__inner">
        <div className="tf-stack tf-stack--loose">
          <Label>{label}</Label>
          <ol className="tf-benefits">
            {items.map((item) => (
              <li key={item.title} className="tf-benefit">
                <div className="tf-stack">
                  <span
                    className={`tf-bar-mark tf-bar-mark--wide tf-bar-mark--${item.light}`}
                  />
                  <h3 className="tf-benefit__title">{item.title}</h3>
                </div>
                <div className="tf-stack tf-benefit__words">
                  <p className="tf-benefit__tagline">{item.tagline}</p>
                  <p className="tf-body tf-body--card">
                    <strong>{proofLabel}</strong> {item.proof}
                    {item.proofBy && (
                      <span className="tf-benefit__by"> {item.proofBy}</span>
                    )}
                    {item.proofLink.href && (
                      <>
                        {" "}
                        <a className="tf-link" href={item.proofLink.href}>
                          {item.proofLink.label}
                        </a>
                      </>
                    )}
                  </p>
                  <BehindLink link={item.behind} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PageWrap>
    </section>
  );
}

function BehindLink({ link }: { link: Link }): JSX.Element {
  return (
    <a className="tf-link tf-link--start" href={link.href}>
      {link.label}
    </a>
  );
}

export const benefits: SectionDefinition = defineSection(
  benefitsSchema,
  BenefitsSection,
  {
    components: { "zh-TW": BenefitsChinese },
    title: "How — what it means for you",
    description:
      "What the methods mean for the visitor: the label, the word before each proof, and each benefit (light, title, tagline, proof, who gave it, an optional link after it, and the link to the method behind it).",
  },
);

type Pattern = z.infer<typeof patternSchema>;
type Method = z.infer<typeof methodSchema>;
type Benefits = z.infer<typeof benefitsSchema>;

/** Sam's Chinese page tells How without the case: those sections stay out. */
function NoCase(): JSX.Element {
  return <></>;
}

/** The How page's intro: in Chinese on a mint stage, a key in its keyhole. */
export const howIntro: SectionDefinition = stagedIntro({
  band: "mint",
  mark: "marker-white",
  art: <KeyStage />,
  glyph: <KeyGlyph />,
  heroChips: false,
});

const SEE: Light = "mustard";

const howContent = {
  intro: {
    light: "red",
    eyebrow: "How we work",
    headline: "The key is already in what you know. Here’s how we find it.",
    lede: "The best version of your story usually already exists, scattered across your team, your data and the people you serve. We gather it, keep it whole from the first conversation to the last post, and hand it to the voices your audience already listens to.",
  },
  case: {
    stat: "+30%",
    statLabel: "more visitors than the same period last year",
    label: "A case",
    text: "A public art museum’s international exhibition. High artistic value, and a public that felt it had nothing to do with them.",
    question:
      "So how did a show most people thought wasn’t for them bring them in?",
    more: { label: "Here’s how ↓", href: "#story" },
  },
  story: {
    label: "Here’s how",
    headline: "Four moves, two rounds.",
    moves: [
      {
        light: SEE,
        title: "We read who it wasn’t reaching.",
        text: "Before writing anything, we looked past the people who already visit museums, to the ones the exhibition kept missing.",
        method: {
          label: "See · Seamless Communication ↓",
          href: "#seamless",
          light: SEE,
        },
      },
      {
        light: "mint",
        title: "We matched three creators to those people.",
        text: "With ContentDNA™, we picked creators from law, history and aesthetics. Each read the same show their own way, in words their audience already trusts.",
        method: {
          label: "Reach · ContentDNA™ ↓",
          href: "#contentdna",
          light: "mint",
        },
      },
      {
        light: "red",
        title: "We read the results, and found who was still missing.",
        text: "Round one made 158K+ impressions. Then we looked at who still wasn’t coming.",
        method: {
          label: "Learn · ContentDNA™ ↓",
          href: "#contentdna",
          light: "red",
        },
      },
      {
        light: "mint",
        title: "Round two: three more creators, for them.",
        text: "The second round reached the audiences the first one missed. Visitors rose 30% on the same period last year.",
        method: {
          label: "Reach again · ContentDNA™ ↓",
          href: "#contentdna",
          light: "mint",
        },
      },
    ],
    quote: {
      text: "“Researching, choosing and monitoring creators is hard. One slip and it goes wrong. Having professionals guarding that made us feel safe.”",
      by: "Head of marketing & PR, public art museum",
    },
    aside: {
      title: "Oh, so that’s how.",
      text: "Two things made it work, and they’re behind every project we do: one team that knows your world from start to finish, and a way of finding the voices your audience already trusts.",
    },
  },
  pattern: {
    label: "The pattern",
    headline:
      "Every project follows the same shape. Get the story right, then take it further than you could alone.",
    diagramLabel:
      "How we work: three steps to get your story right, then reach that keeps expanding",
    steps: [
      {
        title: "It already exists",
        text: "In your team, your data and the people you serve.",
      },
      {
        title: "We gather it",
        text: "A Communication Diagnosis. One team learns your field from you.",
      },
      {
        title: "We keep it whole",
        text: "One story, from the first conversation to the last post.",
      },
    ],
    gather: {
      label: "See & Tell · Seamless Communication ↓",
      href: "#seamless",
      light: SEE,
    },
    reach: {
      title: "Then we take it as far as it can go.",
      text: "The right voices carry your story to people who already trust them, and each round reaches the people the last one missed.",
    },
    rings: {
      story: "Your story",
      creators: "Matched creators",
      audiences: "Their audiences",
      beyond: "People who’d never have heard of you",
    },
    reachLink: {
      label: "Reach · ContentDNA™ ↓",
      href: "#contentdna",
      light: "mint",
    },
  },
  seamless: {
    id: "seamless",
    label: "The methods behind it",
    headline: "Seamless Communication",
    tagline: "An extension of your team.",
    points: [
      {
        strong: "We read the environment.",
        text: "Culture, channels and trends, before any message is written.",
      },
      {
        strong: "We learn from you.",
        text: "Your expertise becomes the language your audience understands.",
      },
      {
        strong: "One team, start to finish.",
        text: "The people who diagnose also brief the creators and read the results.",
      },
    ],
    chainsLabel: "Handoffs compared",
    chains: [
      {
        label: "The usual way",
        links: [
          "You",
          "Agency",
          "Creative team",
          "Media buyer",
          "Creator",
          "Audience",
        ],
        note: "Five handoffs. Each one loses a little of what you meant.",
      },
      {
        label: "With us",
        lead: "You + The Fourth, one team",
        links: ["Creators", "Audience"],
        note: "Fewer handoffs. Messages that land the first time.",
      },
    ],
  },
  contentdna: {
    id: "contentdna",
    label: "The methods behind it",
    headline: "ContentDNA™",
    tagline: "You can buy followers. You can’t buy trust. But we can find it.",
    points: [
      {
        strong: "Three layers.",
        text: "Content, emotion and audience, read on both the brand and the creator.",
      },
      {
        strong: "Starts from your audience.",
        text: "Who needs to hear this, and who they already listen to.",
      },
      {
        strong: "Learns every round.",
        text: "Each result shows who is still missing.",
      },
      {
        strong: "People decide.",
        text: "Human judgment, with AI tools we’re building to scale it.",
      },
    ],
    match: {
      label: "A match, shown",
      layer: "Layer",
      left: "海獅說",
      right: "A WWII history tour",
      rows: [
        {
          layer: "Content",
          left: "A storyteller, knowledgeable without lecturing",
          right: "A tour worth discovering",
        },
        {
          layer: "Emotion",
          left: "Warm, deep, funny",
          right: "Curiosity, respect, being moved",
        },
        {
          layer: "Audience",
          left: "25–44, highly educated, greater Taipei",
          right: "Young people who pay for deep travel",
        },
      ],
      resultLabel: "Result:",
      result:
        "338K views across five videos; the tour launched and departs regularly.",
    },
  },
  benefits: {
    label: "What this means for you",
    proofLabel: "Proof:",
    items: [
      {
        light: "mustard",
        title: "A team that knows your world",
        tagline: "We learn your field from you, and work as part of your team.",
        proof:
          "Fitness certification, AI fundraising, a public museum, civic security. One team.",
        proofLink: { label: "See the cases →", href: "/who" },
        behind: {
          label: "Behind this: Seamless Communication ↓",
          href: "#seamless",
        },
      },
      {
        light: "red",
        title: "Marketing money that goes further",
        tagline: "Fewer handoffs. Messages that land the first time.",
        proof:
          "“Helped a mid-size business with a limited budget spend its marketing money well.”",
        proofBy: "(Deputy manager, fitness certification body)",
        behind: {
          label: "Behind this: Seamless Communication ↓",
          href: "#seamless",
        },
      },
      {
        light: "mint",
        title: "Voices your audience already trusts",
        tagline: "Creators matched to your audience, sharper every round.",
        proof:
          "A public art museum, visitors +30% on the same period last year.",
        behind: { label: "Behind this: ContentDNA™ ↓", href: "#contentdna" },
      },
    ],
  },
  "next-step": {
    eyebrow: "Next step",
    headline: "Tell us what you need.",
    action: { label: "Book a conversation →", href: "/work-with-us" },
  },
} satisfies Record<string, JsonObject>;

export const howRoute: RouteDefinitionInput = pageRoute(
  {
    id: "how",
    path: "/how",
    title: "How we work — The Fourth",
    description:
      "One case, four moves, two rounds: how The Fourth finds the story you already have and takes it further with Seamless Communication and ContentDNA™.",
    translations: {
      "zh-TW": {
        title: "工作方法 — The Fourth",
        description:
          "The Fourth 怎麼找出你早就擁有的故事，再透過創作者媒合與 ContentDNA 把它說得更遠。",
      },
    },
  },
  [
    { id: "intro", template: "how:intro", content: howContent.intro },
    { id: "case", template: "how:case", content: howContent.case },
    { id: "story", template: "how:story", content: howContent.story },
    { id: "pattern", template: "how:pattern", content: howContent.pattern },
    { id: "seamless", template: "how:method", content: howContent.seamless },
    {
      id: "contentdna",
      template: "how:method",
      content: howContent.contentdna,
    },
    { id: "benefits", template: "how:benefits", content: howContent.benefits },
    {
      id: "next-step",
      template: "page:next-step",
      content: howContent["next-step"],
    },
  ],
);

/**
 * The How page as Sam drew it in Chinese. The pattern is a track of four
 * steps under brackets that lead to the methods; Seamless Communication
 * compares the usual four windows with one team; ContentDNA, on ink, shows
 * one creator as a usual platform sees them and as ContentDNA does, then
 * what goes in and what comes out; and what it means for the visitor is
 * three circles round a promise.
 */

const pad = (index: number): string => String(index + 1).padStart(2, "0");

/** Text whose line breaks are kept and whose *words* are marked. */
function Lines({
  text,
  markClass,
}: {
  text: string;
  markClass?: string;
}): JSX.Element {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line.split(/\*([^*]+)\*/).map((part, at) =>
            at % 2 === 1 ? (
              <span key={at} className={markClass}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/** The small ring key set before the intro's marked word. */
function KeyGlyph(): JSX.Element {
  return (
    <span className="tf-intro__glyph" aria-hidden="true">
      <KeyDrawing shape={KEY_SHAPES.ring} />
    </span>
  );
}

/** A paper disc with a keyhole, a mustard key turning in it. */
function KeyStage(): JSX.Element {
  return (
    <div className="tf-keystage">
      <span className="tf-keystage__hole" />
      <span className="tf-keystage__key">
        <KeyDrawing shape={KEY_SHAPES.ring} />
      </span>
    </div>
  );
}

interface TrackStep {
  name: string;
  tag: string;
  title: string;
  text: string;
  lit: boolean;
}

/** One step on the track: its number on a dot, name, title and text. */
function TrackItem({
  step,
  index,
}: {
  step: TrackStep;
  index: number;
}): JSX.Element {
  return (
    <li className="tf-track__step">
      <span className="tf-track__dotrow">
        <span
          className={step.lit ? "tf-track__n tf-track__n--red" : "tf-track__n"}
        >
          {index + 1}
        </span>
      </span>
      <span className="tf-track__name">
        {step.name}
        {step.tag && (
          <>
            {" "}
            <span className="tf-track__tag">{step.tag}</span>
          </>
        )}
      </span>
      <strong className="tf-track__title">{step.title}</strong>
      <span className="tf-track__text">{step.text}</span>
    </li>
  );
}

/** A bracket under the steps it spans, leading down to their method. */
function Bracket({
  link,
  from,
  span,
}: {
  link: Pattern["gather"];
  from: number;
  span: number;
}): JSX.Element {
  return (
    <a
      className={`tf-bracket tf-bracket--${link.light} tf-bracket--from-${from} tf-bracket--span-${span}`}
      href={link.href}
    >
      <span className="tf-bracket__line" aria-hidden="true" />
      <span className="tf-bracket__label">
        {link.label}{" "}
        <span className="tf-bracket__arrow" aria-hidden="true">
          ↓
        </span>
      </span>
    </a>
  );
}

function PatternChinese(pattern: Pattern): JSX.Element {
  const { steps, reach, reachLink, promise, gather, repeat } = pattern;
  const track: TrackStep[] = [
    ...steps.map((step) => ({ ...step, lit: false })),
    { ...reach, lit: reachLink.light === "red" },
    ...(promise.name ? [{ ...promise, lit: false }] : []),
  ];
  return (
    <section id="pattern" className="tf-zpattern">
      <PageWrap className="tf-zpattern__inner">
        <div className="tf-stack">
          <Label>{pattern.label}</Label>
          <h2 className="tf-zpattern__headline">
            <Lines text={pattern.headline} />
          </h2>
        </div>
        <ol className="tf-track" aria-label={pattern.diagramLabel || undefined}>
          {track.map((step, index) => (
            <TrackItem
              key={step.name || step.title}
              step={step}
              index={index}
            />
          ))}
        </ol>
        <div className="tf-brackets">
          <Bracket link={gather} from={1} span={steps.length} />
          <Bracket link={reachLink} from={steps.length + 1} span={1} />
          {promise.link.href && (
            <Bracket link={promise.link} from={steps.length + 2} span={1} />
          )}
        </div>
        {repeat.label && (
          <p className="tf-repeat">
            <span className="tf-repeat__mark" aria-hidden="true">
              ↻
            </span>
            <span>
              <strong>{repeat.label}</strong>：{repeat.text}
            </span>
          </p>
        )}
      </PageWrap>
    </section>
  );
}

/** The usual windows a story passes through, against one team. */
function Windows({ method }: { method: Method }): JSX.Element {
  const { chains, chainsLabel, chainsNote, handoff, chainsUnit } = method;
  return (
    <figure className="tf-windows" aria-label={chainsLabel || undefined}>
      {chains.map((chain, index) => (
        <Fragment key={chain.label}>
          {index > 0 && <div className="tf-windows__rule" aria-hidden="true" />}
          <div className="tf-windows__row">
            <div className="tf-windows__who">
              <strong>{chain.label}</strong>
              {chain.sub && (
                <span className="tf-windows__sub">{chain.sub}</span>
              )}
            </div>
            {chain.lead ? (
              <div className="tf-windows__lead">
                <strong>{chain.lead}</strong>
                <div className="tf-windows__dots">
                  {chain.stages.map((stage) => (
                    <span key={stage}>{stage}</span>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="tf-windows__chips">
                {chain.links.map((link, at) => (
                  <li key={link} className="tf-windows__chip">
                    {at > 0 && handoff && (
                      <span className="tf-windows__hand" aria-hidden="true">
                        {handoff}
                        <span className="tf-windows__dash" />
                      </span>
                    )}
                    {chain.stages[at] && (
                      <span className="tf-windows__stage">
                        {chain.stages[at]}
                      </span>
                    )}
                    <strong>{link}</strong>
                  </li>
                ))}
              </ol>
            )}
            <span className="tf-windows__count">
              {chain.lead ? 1 : chain.links.length}
              <span className="tf-windows__unit">{chainsUnit}</span>
            </span>
          </div>
        </Fragment>
      ))}
      {chainsNote && <figcaption>{chainsNote}</figcaption>}
    </figure>
  );
}

type Compare = NonNullable<Method["compare"]>;

function Creator({ creator }: { creator: Compare["creator"] }): JSX.Element {
  return (
    <div className="tf-view__creator">
      <span className="tf-view__avatar" aria-hidden="true">
        {creator.initial}
      </span>
      <span className="tf-view__who">
        <strong>{creator.name}</strong>
        <span className="tf-view__meta">{creator.meta}</span>
      </span>
    </div>
  );
}

/** One creator, as a usual platform sees them and as ContentDNA does. */
function Views({ compare }: { compare: Compare }): JSX.Element {
  return (
    <div className="tf-views">
      <p className="tf-views__label">
        {compare.label}
        {compare.badge && (
          <span className="tf-views__badge">{compare.badge}</span>
        )}
      </p>
      <div className="tf-views__cards">
        <div className="tf-view tf-view--usual">
          <span className="tf-view__label">{compare.usual.label}</span>
          <Creator creator={compare.creator} />
          <div className="tf-view__stats">
            {compare.usual.stats.map((stat) => (
              <span key={stat.label} className="tf-view__stat">
                <span className="tf-view__stat-label">{stat.label}</span>
                {stat.value ? (
                  <strong>{stat.value}</strong>
                ) : (
                  <span className="tf-view__blank" aria-hidden="true" />
                )}
              </span>
            ))}
          </div>
          {compare.rows.map((row) => (
            <div key={row.label} className="tf-view__row">
              <span className="tf-view__row-label">{row.label}</span>
              <span className="tf-view__row-text">{row.usual}</span>
            </div>
          ))}
        </div>
        <div className="tf-view tf-view--ours">
          <span className="tf-view__label">{compare.ours.label}</span>
          <Creator creator={compare.creator} />
          <div className="tf-view__layers">
            {compare.ours.layers.map((layer) => (
              <div key={layer.label} className="tf-view__layer">
                <span className="tf-view__layer-label">{layer.label}</span>
                <span className="tf-view__tags">
                  {layer.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`tf-view__tag tf-view__tag--${layer.light}`}
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {compare.rows.map((row) => (
            <div key={row.label} className="tf-view__row">
              <span className="tf-view__row-label">{row.label}</span>
              <span className="tf-view__row-text">{row.ours}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What goes into ContentDNA, and what comes out. */
function Flow({ flow }: { flow: NonNullable<Method["flow"]> }): JSX.Element {
  return (
    <div className="tf-flow">
      <p className="tf-flow__title">{flow.title}</p>
      <div className="tf-flow__strip">
        <div className="tf-flow__inputs">
          {flow.inputs.map((input) => (
            <span key={input.title} className="tf-flow__box">
              <strong>{input.title}</strong>
              <span>{input.text}</span>
            </span>
          ))}
        </div>
        <span className="tf-flow__arrow">
          {flow.into}
          <span aria-hidden="true">→</span>
        </span>
        <span className="tf-flow__engine">{flow.engine}</span>
        <span className="tf-flow__arrow">
          {flow.out}
          <span aria-hidden="true">→</span>
        </span>
        <div className="tf-flow__outputs">
          {flow.outputs.map((output) => (
            <span key={output.title} className="tf-flow__box tf-flow__box--out">
              <strong>{output.title}</strong>
              <span>{output.text}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Columns({
  points,
  four,
}: {
  points: Method["points"];
  four: boolean;
}): JSX.Element {
  return (
    <ol className={four ? "tf-cols tf-cols--4" : "tf-cols"}>
      {points.map((point, index) => (
        <li key={point.strong}>
          <span className="tf-cols__n">{pad(index)}</span>
          <strong>{point.strong}</strong>
          <span className="tf-cols__text">{point.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A method in Chinese. Seamless Communication: its name over its Chinese
 * gloss, the windows compared, three points. ContentDNA (the one with a
 * comparison): on ink, its name small and its tagline as the headline, the
 * two views, the flow, four points.
 */
function MethodChinese(method: Method): JSX.Element {
  const { compare, flow } = method;
  if (compare) {
    return (
      <section id={method.id} className="tf-zmethod tf-zmethod--dark">
        <PageWrap className="tf-zmethod__inner">
          <div className="tf-zmethod__head">
            <Label>{method.label}</Label>
            <p className="tf-zmethod__kicker">
              {method.headline}
              {method.gloss && (
                <>
                  {" "}
                  <span className="tf-zmethod__gloss">{method.gloss}</span>
                </>
              )}
            </p>
            <h2 className="tf-zmethod__name tf-reveal">
              <Lines text={method.tagline} markClass="tf-zmethod__mark" />
            </h2>
          </div>
          <Views compare={compare} />
          {flow && <Flow flow={flow} />}
          <Columns points={method.points} four />
        </PageWrap>
      </section>
    );
  }
  return (
    <section id={method.id} className="tf-zmethod">
      <PageWrap className="tf-zmethod__inner">
        <div className="tf-zmethod__head">
          <Label>{method.label}</Label>
          <h2 className="tf-zmethod__name tf-reveal">
            {method.headline}
            {method.gloss && (
              <span className="tf-zmethod__gloss">{method.gloss}</span>
            )}
          </h2>
          <p className="tf-zmethod__tagline">{method.tagline}</p>
        </div>
        {method.chains.length > 0 && <Windows method={method} />}
        <Columns points={method.points} four={false} />
      </PageWrap>
    </section>
  );
}

/** What it means for the visitor: three circles round the promise. */
function BenefitsChinese(benefits: Benefits): JSX.Element {
  const { items, headline, tagline, center } = benefits;
  return (
    <section id="benefits" className="tf-zmethod tf-zbenefits">
      <PageWrap className="tf-zmethod__inner">
        <div className="tf-zmethod__head">
          <Label>{benefits.label}</Label>
          <h2 className="tf-zmethod__name tf-reveal">{headline}</h2>
          {tagline && <p className="tf-zmethod__tagline">{tagline}</p>}
        </div>
        <div className="tf-venn" role="list" aria-label={headline}>
          {items.map((item, index) => (
            <div
              key={item.title}
              role="listitem"
              className={`tf-vc tf-v${index + 1} tf-vc--${item.light}`}
            >
              <span className="tf-vbg" aria-hidden="true" />
              <div className="tf-vt">
                <span className="tf-vn">{pad(index)}</span>
                <strong>{item.title}</strong>
                <span>{item.tagline}</span>
              </div>
            </div>
          ))}
          {center && (
            <div role="listitem" className="tf-vcenter">
              <span className="tf-vn">{pad(items.length)}</span>
              <strong>
                <Lines text={center} />
              </strong>
            </div>
          )}
        </div>
      </PageWrap>
    </section>
  );
}
