import type { JSX } from "react";
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
  statSchema,
  Stats,
} from "./common";

/**
 * What The Fourth does: three steps (See, Tell, Reach), each a set of
 * services. The page lists them first as an index of numbered tiles, asks
 * for the next step, then gives each step its big word and each service
 * what it is, what The Fourth does, what the client gets and where it was
 * seen. The loop back to See and a note on talks and fees close it.
 */
const serviceSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  what: z.string(),
  does: z.array(z.string()),
  gets: z.array(z.string()),
  seen: z
    .object({
      title: z.string(),
      text: z.string(),
      stats: z.array(statSchema).default([]),
      link: linkSchema,
    })
    .default({ title: "", text: "", stats: [], link: { label: "", href: "" } }),
});

const ICONS = ["eye", "screen", "phone"] as const;

const stepSchema = z.object({
  id: z.string(),
  light: lightSchema,
  icon: z.enum(ICONS),
  name: z.string(),
  word: z.string(),
  text: z.string(),
  services: z.array(serviceSchema),
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

/** Every service numbered across the steps, in order. */
function numbered(
  steps: Step[],
): Array<{ step: Step; items: Array<{ service: Service; n: string }> }> {
  const counts = steps.map((step) => step.services.length);
  return steps.map((step, s) => {
    const before = counts.slice(0, s).reduce((sum, count) => sum + count, 0);
    return {
      step,
      items: step.services.map((service, i) => ({
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
    <article id={service.id} className="tf-service">
      <div className="tf-service__words">
        <span className="tf-plabel tf-plabel--muted">{`${n} · ${bare(step.word)}`}</span>
        <h3 className="tf-service__title">{service.title}</h3>
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
      {service.seen.title && (
        <div className="tf-pcard tf-seen">
          <Label>{labels.seen}</Label>
          <p className="tf-seen__title">{service.seen.title}</p>
          <p className="tf-body tf-body--card">{service.seen.text}</p>
          <Stats stats={service.seen.stats} />
          {service.seen.link.href && (
            <a className="tf-link" href={service.seen.link.href}>
              {service.seen.link.label}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function ServicesSection({
  indexLabel,
  labels,
  next,
  steps,
}: z.infer<typeof servicesSchema>): JSX.Element {
  const rows = numbered(steps);
  return (
    <>
      <section className="tf-index">
        <PageWrap>
          <nav className="tf-index__nav" aria-label={indexLabel}>
            {rows.map(({ step, items }) => (
              <div key={step.id} className="tf-index__row">
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
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </PageWrap>
      </section>
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
                <h2 className="tf-step__word">{step.word}</h2>
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
      "The steps and their services: the index's name for screen readers, the labels over each service's parts, the next-step band after the index (italic line, question, button), and each step (anchor id, light, icon: eye, screen or phone, name, word, text) with its services (anchor id, title, tagline, what it is, what The Fourth does, what the client gets, and where it was seen: title, text, figures and a link).",
  },
);

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
            <strong>{item.strong}</strong> {item.text}
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
      action: { label: "Book a conversation →", href: "/work-with-us" },
    },
    steps: [
      {
        id: "see",
        light: "mustard",
        icon: "eye",
        name: "Diagnosis",
        word: "See.",
        text: "Before anyone else can understand you, you need to see yourself clearly: where you stand, and how you sound. The Communication Diagnosis, built on ContentDNA™, gives you a new angle on what you already have.",
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
            seen: {
              title: "A fitness certification body",
              text: "From reselling international courses to its own certification brand.",
              stats: [
                { value: "12+", label: "own-brand certification courses" },
              ],
              link: { label: "Read the case →", href: "/who#health" },
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
            gets: [
              "Personality description",
              "Brand–audience fit",
              "Style guide",
            ],
          },
        ],
      },
      {
        id: "tell",
        light: "red",
        icon: "screen",
        name: "The fourth act",
        word: "Tell.",
        text: "Then we turn what we found into a story: who hears what, in which order, in formats your team can keep making.",
        services: [
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
            seen: {
              title: "A Dutch AI start-up",
              text: "The investor story, the Discord community and LinkedIn each got their own job.",
              stats: [{ value: "€150K", label: "raised in six months" }],
              link: { label: "Read the case →", href: "/who#tech" },
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
            seen: {
              title: "A WWII history tour",
              text: "Five short videos with 海獅說 sold a heavy, high-price tour.",
              stats: [{ value: "338K", label: "views across five videos" }],
              link: { label: "Read the case →", href: "/who#art" },
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
            seen: {
              title: "A civic nonprofit",
              text: "Risk data became a “which is bigger” game between friends, with 呂呂.",
              stats: [
                {
                  value: "120.6K",
                  label: "views and interactions in three days",
                },
              ],
              link: { label: "Read the case →", href: "/who#sustainability" },
            },
          },
        ],
      },
      {
        id: "reach",
        light: "mint",
        icon: "phone",
        name: "The fourth wall",
        word: "Reach.",
        text: "Finally, the story leaves your circle, carried by voices your audience already trusts.",
        services: [
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
            seen: {
              title: "A public art museum",
              text: "Went round twice. Round two reached the audiences round one missed.",
              stats: [{ value: "+30%", label: "visitors" }],
              link: { label: "Read the case →", href: "/who#art" },
            },
          },
        ],
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
  },
  [
    { id: "intro", template: "page:intro", content: whatContent.intro },
    {
      id: "services",
      template: "what:services",
      content: whatContent.services,
    },
    { id: "loop", template: "what:loop", content: whatContent.loop },
    { id: "note", template: "what:note", content: whatContent.note },
  ],
);
