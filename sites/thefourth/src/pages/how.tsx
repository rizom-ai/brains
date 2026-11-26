import type { JSX } from "react";
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
  type Light,
} from "./common";

/**
 * How The Fourth works, told through one case: the figure that made people
 * ask, the four moves behind it, the shape every project follows, the two
 * methods (Seamless Communication and ContentDNA™), and what that means for
 * the visitor.
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
    title: "How — the four moves",
    description:
      "The case step by step: the label and headline, each move (light, title, text and the pill to its method: label, link, light), the client's quote and the closing aside (title and text).",
  },
);

const patternSchema = z.object({
  label: z.string(),
  headline: z.string(),
  diagramLabel: z.string(),
  steps: z.array(z.object({ title: z.string(), text: z.string() })),
  gather: lightLinkSchema,
  reach: z.object({ title: z.string(), text: z.string() }),
  rings: z.object({
    story: z.string(),
    creators: z.string(),
    audiences: z.string(),
    beyond: z.string(),
  }),
  reachLink: lightLinkSchema,
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
});

const methodSchema = z.object({
  id: z.string(),
  label: z.string(),
  headline: z.string(),
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
    title: "How — a method",
    description:
      "A method behind the work: its anchor id, label, headline, tagline and numbered points (bold lead and text), then either handoff chains compared (their name for screen readers; each a label, an optional lead link, the links and a note) or a match shown as a table (label, column names, rows of layer, left and right, and the result).",
  },
);

const benefitsSchema = z.object({
  label: z.string(),
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
    title: "How — what it means for you",
    description:
      "What the methods mean for the visitor: the label, the word before each proof, and each benefit (light, title, tagline, proof, who gave it, an optional link after it, and the link to the method behind it).",
  },
);

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
  },
  [
    { id: "intro", template: "page:intro", content: howContent.intro },
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
