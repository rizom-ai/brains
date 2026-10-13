/** @jsxImportSource react */
import type { JSX } from "react";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { renderHighlightedText } from "./rizom";
import { ctaSchema } from "./shared";

/**
 * The /foundation room, told as a story: the institutions built for a
 * different century, the research, the pattern, the series and how it is
 * funded, each a chapter beside the drawing the layout supplies (see
 * ./story/foundation-organism). Each section is authored from one zod schema;
 * copy is content-driven, stored as markdown in
 * site-content/foundation/<section>.md, and the section ids stay stable.
 */

const EMPHASIS_CLS = "italic font-[400] text-accent";

/* ============ the opening ============ */

const heroSchema = z.object({
  volume: z.string(),
  meta: z.string(),
  headline: z.string(),
  standfirst: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});

function FoundationHeroSection({
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <section id="foundation-hero" className="chapter">
      <p className="eyebrow">Foundation</p>
      <h1>{renderHighlightedText(headline, EMPHASIS_CLS)}</h1>
      <p className="lede">{standfirst}</p>
      <p className="doors-in">
        <a href={primaryCta.href}>{primaryCta.label}</a>
        <a href={secondaryCta.href}>{secondaryCta.label}</a>
      </p>
    </section>
  );
}

/* ============ the research and the series: entries on a thread ============ */

const indexRowSchema = z.object({
  no: z.string(),
  kicker: z.string(),
  title: z.string(),
  text: z.string(),
  href: z.string().nullable().default(null),
  meta: z.string().nullable().default(null),
  metaSub: z.string().nullable().default(null),
});

const indexSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  items: z.array(indexRowSchema),
});

function Entry({ row }: { row: z.infer<typeof indexRowSchema> }): JSX.Element {
  const body = (
    <>
      <small>{row.kicker}</small>
      <b>{row.title}</b>
      <span>{[row.text, row.metaSub].filter(Boolean).join(" ")}</span>
    </>
  );
  return (
    <li>{row.href ? <a href={row.href}>{body}</a> : <div>{body}</div>}</li>
  );
}

function EntriesChapter({
  id,
  cap,
  title,
  items,
}: {
  id: string;
  cap: string;
  title: string;
  items: z.infer<typeof indexRowSchema>[];
}): JSX.Element {
  return (
    <section id={id} className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{title}</h2>
      <ul className="entries">
        {items.map((row) => (
          <Entry key={row.title} row={row} />
        ))}
      </ul>
    </section>
  );
}

function FoundationResearchSection({
  cap,
  items,
}: z.infer<typeof indexSchema>): JSX.Element {
  return (
    <EntriesChapter
      id="research"
      cap={cap}
      title="A working bibliography."
      items={items}
    />
  );
}

function FoundationChaptersSection({
  cap,
  items,
}: z.infer<typeof indexSchema>): JSX.Element {
  return (
    <EntriesChapter
      id="events"
      cap={cap}
      title="Twenty to forty people, city by city."
      items={items}
    />
  );
}

/* ============ the pull quote ============ */

const pullquoteSchema = z.object({
  quote: z.string(),
  attribution: z.string(),
});

function FoundationPullquoteSection({
  quote,
  attribution,
}: z.infer<typeof pullquoteSchema>): JSX.Element {
  return (
    <section id="pullquote" className="chapter" data-title="The pattern">
      <p className="pull">{renderHighlightedText(quote, EMPHASIS_CLS)}</p>
      <p>{attribution}</p>
    </section>
  );
}

/* ============ how it is funded ============ */

const supportSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  options: z.array(
    z.object({
      kicker: z.string(),
      amount: z.string(),
      text: z.string(),
    }),
  ),
});

function FoundationSupportSection({
  cap,
  options,
}: z.infer<typeof supportSchema>): JSX.Element {
  return (
    <section id="support" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>Two ways the work gets funded.</h2>
      <dl className="parts">
        {options.map((option) => (
          <div key={option.kicker}>
            <dt>
              {option.kicker} <span className="status">{option.amount}</span>
            </dt>
            <dd>{option.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ the follow line ============ */

const followSchema = z.object({
  claim: z.string(),
  links: z.array(ctaSchema),
});

function FoundationFollowSection({
  claim,
  links,
}: z.infer<typeof followSchema>): JSX.Element {
  return (
    <section id="follow" className="chapter" data-title="Follow the research">
      <p className="pull">
        {renderHighlightedText(claim, "not-italic font-medium text-theme")}
      </p>
      <p className="follow">
        {links.map((link) => (
          <a key={link.href + link.label} href={link.href}>
            {link.label}
          </a>
        ))}
      </p>
    </section>
  );
}

/* ============ the foundation section group ============ */

export const foundationSections: SiteSectionGroup = sectionGroup("foundation", {
  hero: defineSection(heroSchema, FoundationHeroSection, {
    title: "Hero",
    description: "The opening: headline, standfirst and two doors",
  }),
  research: defineSection(indexSchema, FoundationResearchSection, {
    title: "Research",
    description: "The essays, as entries on a thread",
  }),
  pullquote: defineSection(pullquoteSchema, FoundationPullquoteSection, {
    title: "Pullquote",
    description: "The pull quote, as a chapter of its own",
  }),
  chapters: defineSection(indexSchema, FoundationChaptersSection, {
    title: "Chapters",
    description: "The city chapters, as entries on a thread",
  }),
  support: defineSection(supportSchema, FoundationSupportSection, {
    title: "Support",
    description: "The two ways the work is funded",
  }),
  follow: defineSection(followSchema, FoundationFollowSection, {
    title: "Follow",
    description: "The follow line that closes the page",
  }),
});
