import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import {
  CaseCard,
  caseSchema,
  chipSchema,
  ChipRow,
  Dot,
  Label,
  lightSchema,
  PageWrap,
  pageRoute,
} from "./common";

/**
 * Who The Fourth works with: one part per world, each anchored for the
 * homepage's chips. A world names the problem in one line, then what its
 * people say, how The Fourth helps and the services it uses, sometimes one
 * phrase before and after translation, and the cases that show it.
 */
const worldSchema = z.object({
  id: z.string(),
  label: z.string(),
  light: lightSchema,
  headline: z.string(),
  hear: z.array(z.string()),
  help: z.string(),
  services: z.array(chipSchema),
  translation: z
    .object({ before: z.string(), after: z.string() })
    .default({ before: "", after: "" }),
  cases: z.array(caseSchema).default([]),
});

const worldsSchema = z.object({
  labels: z.object({
    hear: z.string(),
    help: z.string(),
    services: z.string(),
    before: z.string(),
    after: z.string(),
  }),
  worlds: z.array(worldSchema),
});

type Labels = z.infer<typeof worldsSchema>["labels"];

function World({
  world,
  labels,
}: {
  world: z.infer<typeof worldSchema>;
  labels: Labels;
}): JSX.Element {
  return (
    <section id={world.id} className="tf-band tf-world">
      <PageWrap className="tf-band__inner">
        <div className="tf-world__head">
          <span className="tf-world__label">
            <Dot light={world.light} />
            {world.label}
          </span>
          <h2 className="tf-h2 tf-reveal">{world.headline}</h2>
        </div>
        <div className="tf-world__hear">
          <Label>{labels.hear}</Label>
          <ul className="tf-hear">
            {world.hear.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="tf-split">
          <div className="tf-stack">
            <Label>{labels.help}</Label>
            <p className="tf-body">{world.help}</p>
          </div>
          <div className="tf-stack">
            <Label>{labels.services}</Label>
            <ChipRow chips={world.services} />
          </div>
        </div>
        {world.translation.after && (
          <div className="tf-translation">
            <div className="tf-translation__before">
              <Label>{labels.before}</Label>
              <p>{world.translation.before}</p>
            </div>
            <div className="tf-translation__after">
              <Label>{labels.after}</Label>
              <p>{world.translation.after}</p>
            </div>
          </div>
        )}
        {world.cases.length > 0 && (
          <div className="tf-cases">
            {world.cases.map((item) => (
              <CaseCard key={item.context} item={item} />
            ))}
          </div>
        )}
      </PageWrap>
    </section>
  );
}

function WorldsSection({
  labels,
  worlds,
}: z.infer<typeof worldsSchema>): JSX.Element {
  return (
    <>
      {worlds.map((world) => (
        <World key={world.id} world={world} labels={labels} />
      ))}
    </>
  );
}

export const worlds: SectionDefinition = defineSection(
  worldsSchema,
  WorldsSection,
  {
    title: "Who — the worlds",
    description:
      "The worlds The Fourth works in, each with an anchor id, its label and light, the headline, what its people say, how The Fourth helps, the services it uses (label and link), an optional phrase before and after translation, and its cases (context, story, figures and a quote).",
  },
);

const DIAGNOSIS = { label: "Diagnosis", href: "/what#see" };
const STRATEGY = { label: "Communication strategy", href: "/what#strategy" };
const CONTENT = { label: "Content design", href: "/what#content" };
const AGENDA = { label: "Agenda setting", href: "/what#agenda" };
const MATCHING = { label: "Creator matching", href: "/what#matching" };

const whoContent = {
  intro: {
    light: "red",
    eyebrow: "Who we work with",
    headline: "Every field speaks its own language. We learn yours.",
    lede: "The people we work with have one thing in common: their work is good, and hard to explain to anyone outside their field. Pick your world. You’ll find the problems we usually meet there, what we do about them, and what happened when we did.",
    chipsLabel: "Sectors",
    chips: [
      {
        label: "Sustainability & Impact",
        href: "#sustainability",
        light: "mint",
      },
      { label: "Health & Care", href: "#health", light: "mustard" },
      { label: "Tech & AI", href: "#tech", light: "red" },
      { label: "Art & Culture", href: "#art", light: "ink" },
    ],
  },
  worlds: {
    labels: {
      hear: "What we hear",
      help: "How we help",
      services: "Services we use",
      before: "Before",
      after: "After",
    },
    worlds: [
      {
        id: "sustainability",
        label: "Sustainability & Impact",
        light: "mint",
        headline:
          "Your impact is real. Outside your circle, it sounds like homework.",
        hear: [
          "“People who already care love us. Nobody else listens.”",
          "“International buyers want our ESG story, and we don’t know how to tell it without sounding like we’re bragging.”",
          "“The issue is heavy, so people scroll past.”",
        ],
        help: "We turn the issue into everyday language, then hand it to voices the audience already trusts. For exporters, we write a buyer-facing version backed by data and stated carefully enough to be believed.",
        services: [DIAGNOSIS, STRATEGY, AGENDA, MATCHING],
        cases: [
          {
            context:
              "A civic research nonprofit · Agenda setting + creator matching",
            story:
              "Military aircraft incursions, damaged undersea cables, disinformation. These are real risks, and people look away from them. We noticed facts alone don’t keep anyone watching, but a game does. With 呂呂, the risk data became a “which is bigger” game between friends. Only at the end do viewers learn every number is real.",
            stats: [
              {
                value: "120.6K",
                label: "views and interactions in three days",
              },
            ],
            quote: {
              text: "“Getting a sensitive issue out of the bubble is hard. It takes real sensitivity to culture, history and politics.”",
              by: "Researcher",
            },
          },
          {
            context:
              "An environmental education nonprofit · Content design + creator matching",
            story:
              "Littering is everyone’s habit and nobody’s problem. 呂呂 showed 17,000 cigarette butts hitting the ground every minute as a pixel game, and sent viewers to the exhibition.",
            quote: {
              text: "“They really listened to what we needed and solved the problem.”",
              by: "Brand & social media manager",
            },
          },
        ],
      },
      {
        id: "health",
        label: "Health & Care",
        light: "mustard",
        headline:
          "Care is personal. Your communication shouldn’t read like a package insert.",
        hear: [
          "“Compliance rules make everything we say sound flat.”",
          "“Professionals trust us, but families don’t know we exist.”",
          "“One wrong word costs trust.”",
        ],
        help: "We work inside the compliance rules, not around them. We find the brand’s position and personality first, so it can stay careful and still sound like someone.",
        services: [DIAGNOSIS, AGENDA, MATCHING],
        cases: [
          {
            context: "A fitness certification body, 2024–2025 · Positioning",
            story:
              "For years they resold international courses, which meant thin margins, and their expertise looked like any gym class. Our read: fitness isn’t only for athletes. If everyone is an athlete, there’s a way in at every level, and a certification people want to buy. We built their own brand position and carried it into the year’s course promotion.",
            stats: [
              { value: "12+", label: "own-brand certification courses" },
              { value: "+1.7K", label: "Instagram followers" },
              { label: "Courses in north, central and south Taiwan" },
            ],
            quote: {
              text: "“The key to turning from a reseller into our own brand.”",
              by: "Brand owner",
            },
          },
        ],
      },
      {
        id: "tech",
        label: "Tech & AI",
        light: "red",
        headline:
          "Your product is ahead. Your explanation is still in the lab.",
        hear: [
          "“Investors need three meetings to understand what we do.”",
          "“Our team explains it in engineer language.”",
          "“We don’t know which channel to start with.”",
        ],
        help: "We translate the expert term into the problem your buyer already has, then decide which channel carries which part of the story.",
        services: [DIAGNOSIS, STRATEGY, CONTENT],
        translation: {
          before: "“Transactive Memory Systems.”",
          after:
            "“If your most experienced person left tomorrow, what would your team forget?”",
        },
        cases: [
          {
            context: "A Dutch B2B AI start-up · Communication strategy",
            story:
              "New technology, abstract concept: investors and users needed time to understand it. Fundraising isn’t only a tech skill, so we borrowed from political, nonprofit and tech fundraising. The investor story, the Discord community and LinkedIn each got their own job.",
            stats: [
              { value: "€150K", label: "raised in six months" },
              { value: "40+", label: "active community members" },
              { value: "+300", label: "LinkedIn followers with no ads" },
            ],
            quote: {
              text: "“The right branding also helps us find the right business model, and The Fourth knows what they’re doing.”",
              by: "Founder",
            },
          },
        ],
      },
      {
        id: "art",
        label: "Art & Culture",
        light: "ink",
        headline:
          "The work is world-class. Most people still think it isn’t for them.",
        hear: [
          "“Our marketing only reaches people who already visit museums.”",
          "“The subject is historical or difficult, so it feels distant.”",
          "“We can’t tell which creator will actually bring people in.”",
        ],
        help: "We drop the arts-marketing voice and let people the audience trusts tell it their way.",
        services: [
          { label: "Creator matching", href: "/what#matching" },
          CONTENT,
          AGENDA,
        ],
        cases: [
          {
            context:
              "A public art museum’s international exhibition · Creator matching with ContentDNA™",
            story:
              "High artistic value, and a public that felt it had nothing to do with them. In round one, three creators from law, history and aesthetics each read the same show their own way. Then we looked at who still wasn’t coming and added three more creators for them.",
            stats: [
              { value: "+30%", label: "visitors on the same period last year" },
              { value: "158K+", label: "impressions in round one" },
            ],
            quote: {
              text: "“Researching, choosing and monitoring creators is hard. One slip and it goes wrong. Having professionals guarding that made us feel safe.”",
              by: "Head of marketing & PR",
            },
          },
          {
            context:
              "A deep-history travel company · Content design + creator matching",
            story:
              "A WWII Germany tour: heavy subject, high price. Ordinary travel ads couldn’t sell it. The audience wasn’t travellers; it was people who love history, led by a storyteller they trust. 海獅說 made five short videos, starting on site at places like Dachau.",
            stats: [
              { value: "338K", label: "combined views" },
              { label: "Tour launched and departing regularly" },
            ],
            quote: {
              text: "“With good content design and Sea Lion, more people chose to join us.”",
              by: "Founder",
            },
          },
        ],
      },
    ],
  },
  "next-step": {
    eyebrow: "Next step",
    headline: "Recognise your world?",
    text: "A diagnosis shows where your words stop working, and what to say instead.",
    action: {
      label: "Book a Communication Diagnosis →",
      href: "/work-with-us",
    },
  },
} satisfies Record<string, JsonObject>;

export const whoRoute: RouteDefinitionInput = pageRoute(
  {
    id: "who",
    path: "/who",
    title: "Who we work with — The Fourth",
    description:
      "Sustainability, health, tech and art: the worlds The Fourth works in, what we hear there, how we help and what happened when we did.",
  },
  [
    { id: "intro", template: "page:intro", content: whoContent.intro },
    { id: "worlds", template: "who:worlds", content: whoContent.worlds },
    {
      id: "next-step",
      template: "page:next-step",
      content: whoContent["next-step"],
    },
  ],
);
