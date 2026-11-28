/** @jsxImportSource react */
import type { JSX } from "react";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { ctaSchema } from "./shared";
import { emphasize } from "./story/emphasis";

/**
 * The sections of rizom.ai's former /work room. Rizom Work now speaks on
 * rizom.work (@rizom/site-rizom-work) and rizom.ai no longer routes here; the
 * templates stay registered while the room's copy,
 * site-content/work/<section>.md, is still in the content repo.
 */

/* ============ the opening ============ */

const heroSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function WorkHeroSection({
  eyebrow,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <section id="work-hero" className="chapter">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{emphasize(headline)}</h1>
      <p className="lede">{standfirst}</p>
      <p className="doors-in">
        <a href={primaryCta.href}>{primaryCta.label}</a>
        <a href={secondaryCta.href}>{secondaryCta.label}</a>
      </p>
    </section>
  );
}

/* ============ the problem ============ */

const statementSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  intro: z.string(),
});

function WorkProblemSection({
  cap,
  headline,
  intro,
}: z.infer<typeof statementSchema>): JSX.Element {
  return (
    <section id="work-problem" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <p>{intro}</p>
    </section>
  );
}

/* ============ the audit ============ */

const workshopSchema = z.object({
  ...statementSchema.shape,
  steps: z.array(z.object({ lead: z.string(), text: z.string() })),
  /** The door to book it, when the content gives one. */
  ctas: z.array(ctaSchema).max(1).default([]),
});

// The bar's "Book an audit" lands here.
function WorkAuditSection({
  cap,
  headline,
  intro,
  steps,
  ctas,
}: z.infer<typeof workshopSchema>): JSX.Element {
  return (
    <section id="audit" className="chapter" data-title="The Knowledge Audit">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <p>{intro}</p>
      <ol className="steps">
        {steps.map((step) => (
          <li key={step.lead}>
            <b>{step.lead}</b>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
      {ctas.map((cta) => (
        <a key={cta.href} className="cta" href={cta.href}>
          {cta.label}
        </a>
      ))}
    </section>
  );
}

/* ============ the voices: personas and quotes ============ */

const personasSchema = z.object({
  cap: z.string(),
  personas: z.array(
    z.object({ role: z.string(), quote: z.string(), text: z.string() }),
  ),
});

function WorkPersonasSection({
  cap,
  personas,
}: z.infer<typeof personasSchema>): JSX.Element {
  return (
    <section id="personas" className="chapter" data-title={cap}>
      <p className="eyebrow">{cap}</p>
      <div className="voices">
        {personas.map((persona) => (
          <blockquote key={persona.role}>
            <small>{persona.role}</small>
            {persona.quote}
            <p>{persona.text}</p>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

const quotesSchema = z.object({
  cap: z.string(),
  quotes: z.array(z.object({ text: z.string(), by: z.string() })),
});

function WorkQuotesSection({
  cap,
  quotes,
}: z.infer<typeof quotesSchema>): JSX.Element {
  return (
    <section id="proof" className="chapter" data-title={cap}>
      <p className="eyebrow">{cap}</p>
      <div className="voices">
        {quotes.map((quote) => (
          <blockquote key={quote.by}>
            {quote.text}
            <cite>{quote.by}</cite>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

/* ============ who we are ============ */

const rosterSchema = z.object({
  cap: z.string(),
  people: z.array(z.object({ name: z.string(), role: z.string() })),
});

function WorkRosterSection({
  cap,
  people,
}: z.infer<typeof rosterSchema>): JSX.Element {
  return (
    <section id="people" className="chapter">
      <p className="eyebrow">{cap}</p>
      <ul className="people">
        {people.map((person) => (
          <li key={person.name}>
            <b>{person.name}</b>
            <span>{person.role}</span>
          </li>
        ))}
      </ul>
      <p className="onward">
        <a href="/foundation">The research arm, at the Foundation</a>
      </p>
    </section>
  );
}

/* ============ the question to end on ============ */

const closerSchema = z.object({
  quote: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function WorkCloserSection({
  quote,
  primaryCta,
  secondaryCta,
}: z.infer<typeof closerSchema>): JSX.Element {
  return (
    <section id="closer" className="chapter" data-title="Your team type">
      <h2>{emphasize(quote)}</h2>
      <p className="doors-in">
        <a href={primaryCta.href}>{primaryCta.label}</a>
        <a href={secondaryCta.href}>{secondaryCta.label}</a>
      </p>
    </section>
  );
}

/* ============ the work section group ============ */

export const workSections: SiteSectionGroup = sectionGroup("work", {
  hero: defineSection(heroSchema, WorkHeroSection, {
    title: "Hero",
    description: "The opening: the knowledge problem AI makes visible",
  }),
  problem: defineSection(statementSchema, WorkProblemSection, {
    title: "Problem",
    description: "The coordination-problem statement",
  }),
  workshop: defineSection(workshopSchema, WorkAuditSection, {
    title: "Workshop",
    description: "The Knowledge Audit: survey, the room, the playbook",
  }),
  personas: defineSection(personasSchema, WorkPersonasSection, {
    title: "Personas",
    description: "If this sounds like you: the personas, as voices",
  }),
  quotes: defineSection(quotesSchema, WorkQuotesSection, {
    title: "Quotes",
    description: "What teams tell us, as voices",
  }),
  roster: defineSection(rosterSchema, WorkRosterSection, {
    title: "Roster",
    description: "Who we are, and the research arm",
  }),
  closer: defineSection(closerSchema, WorkCloserSection, {
    title: "Closer",
    description: "The question to end on, and its two doors",
  }),
});
