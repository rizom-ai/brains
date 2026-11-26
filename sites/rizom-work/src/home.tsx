import type { JSX } from "react";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { emphasize, renderHighlightedText } from "@rizom/site-rizom-ai";

/**
 * rizom.work's home, told as a story beside Rizom Work's drawing (see
 * ./organism): heroics, the science of a team's memory, why now, the offer
 * to hubs and to teams, public bodies, partners and the way in. Each chapter
 * is authored from one zod schema; its words live in the brain as
 * site-content/home/<chapter>.md and start from ./home-copy.
 */

const doorSchema = z.object({ label: z.string(), href: z.string() });

const ACCENT = "italic font-[400] text-accent";
const TERM = "font-medium not-italic text-theme";

const Doors = ({
  doors,
}: {
  doors: z.infer<typeof doorSchema>[];
}): JSX.Element => (
  <p className="doors-in">
    {doors.map((door) => (
      <a key={door.href + door.label} href={door.href}>
        {door.label}
      </a>
    ))}
  </p>
);

/* ============ the opening ============ */

const heroSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  doors: z.array(doorSchema).default([]),
});

function Hero({
  eyebrow,
  headline,
  lede,
  doors,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <section id="work-hero" className="chapter">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{renderHighlightedText(headline, ACCENT)}</h1>
      <p className="lede">{lede}</p>
      <Doors doors={doors} />
    </section>
  );
}

/* ============ the science ============ */

const scienceSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
  dimensions: z.array(z.object({ name: z.string(), text: z.string() })),
});

function Science({
  cap,
  headline,
  body,
  dimensions,
}: z.infer<typeof scienceSchema>): JSX.Element {
  return (
    <section id="science" className="chapter" data-title="The science">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      {body.map((paragraph) => (
        <p key={paragraph}>{renderHighlightedText(paragraph, TERM)}</p>
      ))}
      <dl className="dims">
        {dimensions.map((dimension) => (
          <div key={dimension.name}>
            <dt>{dimension.name}</dt>
            <dd>{dimension.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ why now ============ */

const problemSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
});

function Problem({
  cap,
  headline,
  body,
}: z.infer<typeof problemSchema>): JSX.Element {
  return (
    <section id="work-problem" className="chapter" data-title="Why now">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      {body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

/* ============ the offer, in steps: for hubs and for teams ============ */

const offerSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  intro: z.string(),
  steps: z.array(z.object({ title: z.string(), text: z.string() })).min(1),
  cta: doorSchema,
});

function Offer({
  id,
  title,
  cap,
  headline,
  intro,
  steps,
  cta,
}: z.infer<typeof offerSchema> & { id: string; title: string }): JSX.Element {
  return (
    <section id={id} className="chapter" data-title={title}>
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <p>{intro}</p>
      <ol className="steps">
        {steps.map((step) => (
          <li key={step.title}>
            <b>{step.title}</b>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
      <a className="cta" href={cta.href}>
        {cta.label}
      </a>
    </section>
  );
}

const Hubs = (props: z.infer<typeof offerSchema>): JSX.Element => (
  <Offer id="hubs" title="For hubs" {...props} />
);

const Teams = (props: z.infer<typeof offerSchema>): JSX.Element => (
  <Offer id="teams" title="For teams" {...props} />
);

/* ============ public bodies ============ */

const publicSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
  aside: z.string().default(""),
});

function PublicBodies({
  cap,
  headline,
  body,
  aside,
}: z.infer<typeof publicSchema>): JSX.Element {
  return (
    <section id="public" className="chapter" data-title="Public bodies">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      {body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {aside && <p className="aside">{aside}</p>}
    </section>
  );
}

/* ============ partners ============ */

const partnersSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  kinds: z.array(z.object({ name: z.string(), text: z.string() })),
});

function Partners({
  cap,
  headline,
  kinds,
}: z.infer<typeof partnersSchema>): JSX.Element {
  return (
    <section id="partners" className="chapter" data-title="Partners">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <dl className="parts">
        {kinds.map((kind) => (
          <div key={kind.name}>
            <dt>{kind.name}</dt>
            <dd>{kind.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ the way in ============ */

const contactSchema = z.object({
  headline: z.string(),
  doors: z.array(doorSchema).min(1),
});

function Contact({
  headline,
  doors,
}: z.infer<typeof contactSchema>): JSX.Element {
  return (
    <section id="contact" className="chapter" data-title="Talk to us">
      <h2>{emphasize(headline)}</h2>
      <Doors doors={doors} />
    </section>
  );
}

export const workSections: SiteSectionGroup = sectionGroup("work", {
  hero: defineSection(heroSchema, Hero, {
    title: "Hero",
    description: "The opening: heroics, the lede and the doors",
  }),
  science: defineSection(scienceSchema, Science, {
    title: "The science",
    description: "A team's memory and its three dimensions",
  }),
  problem: defineSection(problemSchema, Problem, {
    title: "Why now",
    description: "What AI runs into first",
  }),
  hubs: defineSection(offerSchema, Hubs, {
    title: "For hubs",
    description: "The offer to hubs, in steps",
  }),
  teams: defineSection(offerSchema, Teams, {
    title: "For teams",
    description: "The offer to teams and organizations, in steps",
  }),
  public: defineSection(publicSchema, PublicBodies, {
    title: "Public bodies",
    description: "What a team Brain removes for a public body",
  }),
  partners: defineSection(partnersSchema, Partners, {
    title: "Partners",
    description: "The two kinds of partner",
  }),
  contact: defineSection(contactSchema, Contact, {
    title: "Talk to us",
    description: "The closing line and the doors to the contact form",
  }),
});
