import { Fragment, type JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import { linkSchema } from "../home/links";
import {
  Button,
  Dot,
  Label,
  lightSchema,
  PageWrap,
  pageRoute,
  stagedIntro,
  statSchema,
  Stats,
} from "./common";
import { spaceAfter } from "../words";

/**
 * What The Fourth does: three steps (See, Tell, Reach), each a set of
 * services. The page lists them first as an index of numbered tiles, asks
 * for the next step, then gives each step its big word and each service
 * what it is, what The Fourth does, what the client gets and where it was
 * seen. The loop back to See and a note on talks and fees close it. The
 * services are listed beside the steps, each naming its step, and where a
 * service was seen is spelled out field by field, so the copy stays within
 * markdown's six heading levels. In Chinese the index opens with the cycle
 * of steps, a bar of the steps stays at the top as the page scrolls, and
 * steps and services carry their English names.
 */
const serviceSchema = z.object({
  id: z.string(),
  /** The id of the step the service belongs to. */
  step: z.string(),
  title: z.string(),
  /** Chinese only: the service's English name, under its title. */
  englishTitle: z.string().default(""),
  tagline: z.string(),
  what: z.string(),
  does: z.array(z.string()),
  gets: z.array(z.string()),
  /** Where the service was seen: a case's title, text, figures and link. */
  seenTitle: z.string().default(""),
  seenText: z.string().default(""),
  seenStats: z.array(statSchema).default([]),
  seenLink: linkSchema.default({ label: "", href: "" }),
});

const ICONS = ["eye", "screen", "phone"] as const;

const stepSchema = z.object({
  id: z.string(),
  light: lightSchema,
  icon: z.enum(ICONS),
  name: z.string(),
  word: z.string(),
  /** Chinese only: the step's English word, before its Chinese one. */
  englishWord: z.string().default(""),
  text: z.string(),
});

const servicesSchema = z.object({
  indexLabel: z.string(),
  labels: z.object({
    what: z.string(),
    does: z.string(),
    gets: z.string(),
    seen: z.string(),
  }),
  next: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    action: linkSchema,
  }),
  steps: z.array(stepSchema),
  services: z.array(serviceSchema),
  /** Chinese only: the steps as a cycle over the index. */
  cycle: z
    .object({
      label: z.string(),
      repeat: z.string(),
      stations: z.array(z.object({ label: z.string(), light: lightSchema })),
    })
    .default({ label: "", repeat: "", stations: [] }),
  /** Chinese only: the bar of steps that stays at the top. */
  subnav: z
    .object({ label: z.string(), lead: z.string() })
    .default({ label: "", lead: "" }),
});

type Step = z.infer<typeof stepSchema>;
type Service = z.infer<typeof serviceSchema>;
type Labels = z.infer<typeof servicesSchema>["labels"];

/** The step's word without its full stop: "See." names the tile row "See". */
const bare = (word: string): string => word.replace(/[.。]$/, "");

const number = (index: number): string => String(index + 1).padStart(2, "0");

function StepIcon({ icon }: { icon: Step["icon"] }): JSX.Element {
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
      {icon === "eye" && (
        <>
          <path d="M2 17 C7 8 27 8 32 17 C27 26 7 26 2 17 Z" />
          <circle cx="17" cy="17" r="5" />
        </>
      )}
      {icon === "screen" && (
        <>
          <rect x="3" y="9" width="28" height="19" rx="3" />
          <path d="M12 3 L17 9 L22 3" />
          <path d="M12 32 h10" />
        </>
      )}
      {icon === "phone" && (
        <>
          <rect x="9" y="2" width="16" height="30" rx="3" />
          <path d="M15 27 h4" />
        </>
      )}
    </svg>
  );
}

/** Every step with its services, numbered across the steps in order. */
function numbered(
  steps: Step[],
  services: Service[],
): Array<{ step: Step; items: Array<{ service: Service; n: string }> }> {
  const groups = steps.map((step) =>
    services.filter((service) => service.step === step.id),
  );
  const counts = groups.map((group) => group.length);
  return steps.map((step, s) => {
    const before = counts.slice(0, s).reduce((sum, count) => sum + count, 0);
    return {
      step,
      items: (groups[s] ?? []).map((service, i) => ({
        service,
        n: number(before + i),
      })),
    };
  });
}

function ServiceArticle({
  service,
  n,
  step,
  labels,
}: {
  service: Service;
  n: string;
  step: Step;
  labels: Labels;
}): JSX.Element {
  return (
    <article id={service.id} className={`tf-service tf-service--${step.light}`}>
      <div className="tf-service__words">
        <span className="tf-plabel tf-plabel--muted">{`${n} · ${bare(step.word)}`}</span>
        <h3 className="tf-service__title">{service.title}</h3>
        {service.englishTitle && (
          <p className="tf-service__en">{service.englishTitle}</p>
        )}
        <p className="tf-service__tagline">{service.tagline}</p>
        <div className="tf-stack tf-stack--tight">
          <Label>{labels.what}</Label>
          <p className="tf-body">{service.what}</p>
        </div>
        <div className="tf-stack tf-stack--tight">
          <Label>{labels.does}</Label>
          <ul className="tf-service__does">
            {service.does.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="tf-stack tf-stack--tight">
          <Label>{labels.gets}</Label>
          <ul className="tf-service__gets">
            {service.gets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      {service.seenTitle && (
        <div className="tf-pcard tf-seen">
          <Label>{labels.seen}</Label>
          <p className="tf-seen__title">{service.seenTitle}</p>
          <p className="tf-body tf-body--card">{service.seenText}</p>
          <Stats stats={service.seenStats} />
          {service.seenLink.href && (
            <a className="tf-link" href={service.seenLink.href}>
              {service.seenLink.label}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/** The steps as a cycle: each station lit, then round again. */
function Cycle({
  cycle,
}: {
  cycle: z.infer<typeof servicesSchema>["cycle"];
}): JSX.Element {
  return (
    <div className="tf-cycle" role="group" aria-label={cycle.label}>
      {cycle.stations.map((station, index) => (
        <Fragment key={station.label}>
          {index > 0 && (
            <span className="tf-cycle__sep" aria-hidden="true">
              ›
            </span>
          )}
          <span className="tf-cycle__station">
            <Dot light={station.light} />
            {station.label}
          </span>
        </Fragment>
      ))}
      <span className="tf-cycle__repeat">
        <span aria-hidden="true">↻</span>
        {cycle.repeat}
      </span>
    </div>
  );
}

function ServicesSection({
  indexLabel,
  labels,
  next,
  steps,
  services,
  cycle,
  subnav,
}: z.infer<typeof servicesSchema>): JSX.Element {
  const rows = numbered(steps, services);
  return (
    <>
      <section className="tf-index">
        <PageWrap>
          {cycle.stations.length > 0 && <Cycle cycle={cycle} />}
          <nav className="tf-index__nav" aria-label={indexLabel}>
            {rows.map(({ step, items }) => (
              <div
                key={step.id}
                className={`tf-index__row tf-index__row--${step.light}`}
              >
                <a className="tf-index__step" href={`#${step.id}`}>
                  <Dot light={step.light} />
                  <span className="tf-index__word">{bare(step.word)}</span>
                  <span className="tf-index__name">{step.name}</span>
                </a>
                <div className="tf-index__tiles">
                  {items.map(({ service, n }) => (
                    <a
                      key={service.id}
                      className="tf-index__tile"
                      href={`#${service.id}`}
                    >
                      <span className="tf-index__n">{n}</span>
                      <span className="tf-index__title">{service.title}</span>
                      {service.englishTitle && (
                        <span className="tf-index__en">
                          {service.englishTitle}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </PageWrap>
      </section>
      {subnav.lead && (
        <nav className="tf-subnav" aria-label={subnav.label || subnav.lead}>
          <div className="tf-subnav__inner">
            <span className="tf-subnav__label">{subnav.lead}</span>
            {steps.map((step) => (
              <a key={step.id} className="tf-subnav__link" href={`#${step.id}`}>
                {bare(step.word)}
              </a>
            ))}
            <a
              className="tf-btn tf-btn--ink tf-subnav__cta"
              href={next.action.href}
            >
              {next.action.label}
            </a>
          </div>
        </nav>
      )}
      <section className="tf-next">
        <PageWrap className="tf-next__inner">
          <p className="tf-next__eyebrow">{next.eyebrow}</p>
          <p className="tf-next__headline">{next.headline}</p>
          <Button link={next.action} tone="mustard" />
        </PageWrap>
      </section>
      {rows.map(({ step, items }) => (
        <section
          key={step.id}
          id={step.id}
          className={`tf-step tf-step--${step.id}`}
        >
          <PageWrap className="tf-step__inner">
            <div className="tf-step__head">
              <div className="tf-stack tf-stack--snug">
                <span className="tf-step__name">
                  <span
                    className={`tf-step__badge tf-step__badge--${step.light}`}
                  >
                    <StepIcon icon={step.icon} />
                  </span>
                  {step.name}
                </span>
                <h2 className="tf-step__word">
                  {step.englishWord ? (
                    <>
                      {step.englishWord}{" "}
                      <span className="tf-step__local">{step.word}</span>
                    </>
                  ) : (
                    step.word
                  )}
                </h2>
              </div>
              <p className="tf-body tf-body--lead">{step.text}</p>
            </div>
            {items.map(({ service, n }) => (
              <ServiceArticle
                key={service.id}
                service={service}
                n={n}
                step={step}
                labels={labels}
              />
            ))}
          </PageWrap>
        </section>
      ))}
    </>
  );
}

export const services: SectionDefinition = defineSection(
  servicesSchema,
  ServicesSection,
  {
    title: "What — the services",
    description:
      "The steps and their services: the index's name for screen readers, the labels over each service's parts, the next-step band after the index (italic line, question, button), each step (anchor id, light, icon: eye, screen or phone, name, word, text), and each service (anchor id, the id of its step, title, tagline, what it is, what The Fourth does, what the client gets, and where it was seen: title, text, figures and a link). In Chinese, steps and services also carry their English names, the index opens with the cycle of steps (its label, stations and the word for going round again), and a bar of the steps (its name and lead) stays at the top.",
  },
);

/** The three steps' marks as badges on the stage, tilted. */
function StepBadges(): JSX.Element {
  return (
    <div className="tf-badges">
      {ICONS.map((icon, index) => (
        <span key={icon} className={`tf-badge tf-badge--${index + 1}`}>
          <StepIcon icon={icon} />
        </span>
      ))}
    </div>
  );
}

/** The What page's intro: in Chinese on a red stage, the steps as badges. */
export const whatIntro: SectionDefinition = stagedIntro({
  band: "red",
  mark: "marker-mustard",
  art: <StepBadges />,
  heroChips: false,
});

const loopSchema = z.object({
  headline: z.string(),
  stations: z.array(z.object({ label: z.string(), light: lightSchema })),
  text: z.string(),
});

function LoopSection({
  headline,
  stations,
  text,
}: z.infer<typeof loopSchema>): JSX.Element {
  return (
    <section className="tf-loop">
      <PageWrap className="tf-loop__inner">
        <h2 className="tf-next__headline">{headline}</h2>
        <ol className="tf-loop__stations">
          {stations.map((station, index) => (
            <li key={station.label}>
              <span className="tf-loop__station">
                <Dot light={station.light} />
                {station.label}
              </span>
              <span className="tf-loop__arrow" aria-hidden="true">
                {index === stations.length - 1 ? "↺" : "→"}
              </span>
            </li>
          ))}
        </ol>
        <p className="tf-body">{text}</p>
      </PageWrap>
    </section>
  );
}

export const loop: SectionDefinition = defineSection(loopSchema, LoopSection, {
  title: "What — the loop",
  description:
    "How results lead back to the start: the headline, the stations in order (label and light) and the sentence under them.",
});

const noteSchema = z.object({
  items: z.array(z.object({ strong: z.string(), text: z.string() })),
});

function NoteSection({ items }: z.infer<typeof noteSchema>): JSX.Element {
  return (
    <section>
      <PageWrap className="tf-note">
        {items.map((item) => (
          <span key={item.strong}>
            <strong>{item.strong}</strong>
            {spaceAfter(item.strong)}
            {item.text}
          </span>
        ))}
      </PageWrap>
    </section>
  );
}

export const note: SectionDefinition = defineSection(noteSchema, NoteSection, {
  title: "What — the note",
  description: "Short closing lines, each a bold lead and the rest.",
});

const whatContent = {
  intro: {
    light: "red",
    eyebrow: "What we do",
    headline:
      "Getting your story to the right audience, and it starts with the right content.",
    lede: "Three steps: we help you *see* what you already have, *tell* it so people get it, and *reach* the people who should hear it.",
  },
  services: {
    indexLabel: "Services",
    labels: {
      what: "What it is",
      does: "What we do",
      gets: "You get",
      seen: "Seen in",
    },
    next: {
      eyebrow: "Next step",
      headline: "Tell us what you need.",
      action: {
        label: "Book a conversation →",
        href: "/work-with-us",
      },
    },
    steps: [
      {
        id: "see",
        light: "mustard",
        icon: "eye",
        name: "Diagnosis",
        word: "See.",
        text: "Before anyone else can understand you, you need to see yourself clearly: where you stand, and how you sound. The Communication Diagnosis, built on ContentDNA™, gives you a new angle on what you already have.",
      },
      {
        id: "tell",
        light: "red",
        icon: "screen",
        name: "The fourth act",
        word: "Tell.",
        text: "Then we turn what we found into a story: who hears what, in which order, in formats your team can keep making.",
      },
      {
        id: "reach",
        light: "mint",
        icon: "phone",
        name: "The fourth wall",
        word: "Reach.",
        text: "Finally, the story leaves your circle, carried by voices your audience already trusts.",
      },
    ],
    services: [
      {
        id: "positioning",
        title: "Brand positioning",
        tagline: "Where you stand, and why it’s yours.",
        what: "Deciding where you stand in your market and which audience matters most, so every message after it has a direction. We read your market, and the culture and politics around it.",
        does: [
          "Talk with your team and the people you serve",
          "Map competitors and how they talk",
          "Read the cultural and political context around your audience",
          "Choose the priority audience and the position you can own",
        ],
        gets: ["Positioning map", "Priority audience, and why them"],
        step: "see",
        seenTitle: "A fitness certification body",
        seenText:
          "From reselling international courses to its own certification brand.",
        seenStats: [
          {
            value: "12+",
            label: "own-brand certification courses",
          },
        ],
        seenLink: {
          label: "Read the case →",
          href: "/who#health",
        },
      },
      {
        id: "personality",
        title: "Brand personality",
        tagline: "What you sound like, so people remember.",
        what: "The character people meet when they read, watch or hear you: your tone, your words, and the feeling you leave behind. Facts prove you did it. Emotion makes people remember who you are.",
        does: [
          "Find how you intend to come across, with the brand personality test",
          "Compare it with how your audience sees you now",
          "Define tone, vocabulary and the emotions you want to leave",
          "Write a style guide your team can actually use",
        ],
        gets: ["Personality description", "Brand–audience fit", "Style guide"],
        step: "see",
      },
      {
        id: "strategy",
        title: "Communication strategy",
        tagline: "Who hears what, where.",
        what: "A plan for which audience hears which part of your story, on which channel, and in what order. There are no good or bad channels, only ones that fit your audience.",
        does: [
          "Map each audience against the channels they already use",
          "Give each channel its own job in the story",
          "Set priorities so a limited budget goes where it counts",
        ],
        gets: ["Audience × channel plan", "Priorities", "Budget advice"],
        step: "tell",
        seenTitle: "A Dutch AI start-up",
        seenText:
          "The investor story, the Discord community and LinkedIn each got their own job.",
        seenStats: [
          {
            value: "€150K",
            label: "raised in six months",
          },
        ],
        seenLink: {
          label: "Read the case →",
          href: "/who#tech",
        },
      },
      {
        id: "content",
        title: "Content design",
        tagline: "Series your team can keep making.",
        what: "Turning your story into repeatable formats, so content keeps coming after we leave, not one campaign that ends.",
        does: [
          "Build a content strategy from your positioning",
          "Design series formats, with templates and scripts",
          "Set a publishing rhythm your team can keep",
        ],
        gets: [
          "Content strategy",
          "Series formats and templates",
          "Publishing rhythm",
        ],
        step: "tell",
        seenTitle: "A WWII history tour",
        seenText:
          "Five short videos with 海獅說 sold a heavy, high-price tour.",
        seenStats: [
          {
            value: "338K",
            label: "views across five videos",
          },
        ],
        seenLink: {
          label: "Read the case →",
          href: "/who#art",
        },
      },
      {
        id: "agenda",
        title: "Agenda setting",
        tagline: "Putting your issue on the right table.",
        what: "Getting an issue discussed by people who don’t yet think it concerns them. We map the issue and everyone in it, then find the unexpected way in.",
        does: [
          "Break the issue down and map everyone in it",
          "Find the angle that connects it to everyday life",
          "Plan who raises it, where, and when",
        ],
        gets: ["Issue breakdown", "Agenda strategy", "Action plan"],
        step: "tell",
        seenTitle: "A civic nonprofit",
        seenText:
          "Risk data became a “which is bigger” game between friends, with 呂呂.",
        seenStats: [
          {
            value: "120.6K",
            label: "views and interactions in three days",
          },
        ],
        seenLink: {
          label: "Read the case →",
          href: "/who#sustainability",
        },
      },
      {
        id: "matching",
        title: "Creator matching",
        tagline: "Voices your audience already trusts.",
        what: "Finding the creators whose audience already trusts them on the subject you need to talk about. Matched with ContentDNA™ on content, emotion and audience, not follower count.",
        does: [
          "Read your brand and each creator on content, emotion and audience",
          "Shortlist creators and explain why each one fits",
          "Negotiate and brief the collaboration",
          "Read the results, and find who is still missing",
        ],
        gets: [
          "Shortlist and why each fits",
          "Negotiated collaboration",
          "Results beyond reach",
        ],
        step: "reach",
        seenTitle: "A public art museum",
        seenText:
          "Went round twice. Round two reached the audiences round one missed.",
        seenStats: [
          {
            value: "+30%",
            label: "visitors",
          },
        ],
        seenLink: {
          label: "Read the case →",
          href: "/who#art",
        },
      },
    ],
  },
  loop: {
    headline: "Results feed the next round.",
    stations: [
      { label: "See", light: "mustard" },
      { label: "Tell", light: "red" },
      { label: "Reach", light: "ink" },
      { label: "Results", light: "mint" },
    ],
    text: "Each result shows who is still missing, and that takes you back to See. Start at any service. Full power is going round more than once.",
  },
  note: {
    items: [
      { strong: "Talks and workshops", text: "on request" },
      { strong: "Fees", text: "depend on hours and type of service" },
    ],
  },
} satisfies Record<string, JsonObject>;

export const whatRoute: RouteDefinitionInput = pageRoute(
  {
    id: "what",
    path: "/what",
    title: "What we do — The Fourth",
    description:
      "See, tell, reach: the Communication Diagnosis, positioning, strategy, content design, agenda setting and creator matching.",
    translations: {
      "zh-TW": {
        title: "服務項目 — The Fourth",
        description:
          "看見、訴說、抵達：品牌診斷、品牌定位、溝通策略、內容設計、議題設定與創作者媒合。",
      },
    },
  },
  [
    { id: "intro", template: "what:intro", content: whatContent.intro },
    {
      id: "services",
      template: "what:services",
      content: whatContent.services,
    },
    { id: "loop", template: "what:loop", content: whatContent.loop },
    { id: "note", template: "what:note", content: whatContent.note },
  ],
);
