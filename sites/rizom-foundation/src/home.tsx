import type { JSX } from "react";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { emphasize, renderHighlightedText } from "@rizom/site-rizom-ai";
import { inline } from "./inline";
import { FOUNDATION_STYLESHEET_PATH } from "./styles";

/**
 * rizom.foundation's home, told as a story beside the Foundation's drawing
 * (see ./organism): the case, members' writing, the mission, events, the
 * founding supporters, why a foundation, the board and how to follow. Each
 * chapter is authored from one zod schema; its words live in the brain as
 * site-content/home/<chapter>.md and start from ./home-copy.
 */

const doorSchema = z.object({ label: z.string(), href: z.string() });

const ACCENT = "italic font-[400] text-accent";

/* ============ the opening ============ */

const heroSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  body: z.array(z.string()).default([]),
  doors: z.array(doorSchema).default([]),
});

function Hero({
  eyebrow,
  headline,
  lede,
  body,
  doors,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <section id="foundation-hero" className="chapter">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{renderHighlightedText(headline, ACCENT)}</h1>
      <p className="lede">{lede}</p>
      {body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p className="doors-in">
        {doors.map((door) => (
          <a key={door.href + door.label} href={door.href}>
            {door.label}
          </a>
        ))}
      </p>
    </section>
  );
}

/* ============ members' writing and events: entries on a thread ============ */

const entrySchema = z.object({
  kicker: z.string(),
  title: z.string(),
  text: z.string(),
  href: z.string().nullable().default(null),
});

const entriesSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  intro: z.string(),
  items: z.array(entrySchema),
});

function Entry({ entry }: { entry: z.infer<typeof entrySchema> }): JSX.Element {
  const body = (
    <>
      <small>{entry.kicker}</small>
      <b>{entry.title}</b>
      <span>{entry.text}</span>
    </>
  );
  return (
    <li>{entry.href ? <a href={entry.href}>{body}</a> : <div>{body}</div>}</li>
  );
}

function Entries({
  id,
  title,
  cap,
  headline,
  intro,
  items,
}: z.infer<typeof entriesSchema> & { id: string; title: string }): JSX.Element {
  return (
    <section id={id} className="chapter" data-title={title}>
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <p>{intro}</p>
      <ul className="entries">
        {items.map((entry) => (
          <Entry key={entry.title} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

const Writing = (props: z.infer<typeof entriesSchema>): JSX.Element => (
  <Entries id="writing" title="Members' writing" {...props} />
);

const Events = (props: z.infer<typeof entriesSchema>): JSX.Element => (
  <Entries id="events" title="Events" {...props} />
);

/* ============ the mission ============ */

const missionSchema = z.object({
  claim: z.string(),
  body: z.array(z.string()).default([]),
});

function Mission({ claim, body }: z.infer<typeof missionSchema>): JSX.Element {
  return (
    <section id="mission" className="chapter" data-title="Mission">
      <p className="pull">{renderHighlightedText(claim, ACCENT)}</p>
      {body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

/* ============ founding supporters ============ */

const supportSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  intro: z.string(),
  options: z.array(
    z.object({ name: z.string(), note: z.string(), text: z.string() }),
  ),
  aside: z.string(),
  pledge: doorSchema,
  onward: doorSchema,
});

function Support({
  cap,
  headline,
  intro,
  options,
  aside,
  pledge,
  onward,
}: z.infer<typeof supportSchema>): JSX.Element {
  return (
    <section id="support" className="chapter" data-title="Founding supporters">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <p>{intro}</p>
      <dl className="parts">
        {options.map((option) => (
          <div key={option.name}>
            <dt>
              {option.name} <span className="status">{option.note}</span>
            </dt>
            <dd>{option.text}</dd>
          </div>
        ))}
      </dl>
      <p className="aside">{aside}</p>
      <a className="cta" href={pledge.href}>
        {pledge.label}
      </a>
      <p className="onward">
        <a href={onward.href}>{onward.label}</a>
      </p>
    </section>
  );
}

/* ============ why a foundation ============ */

const whySchema = z.object({
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
  figures: z.array(
    z.object({ figure: z.string(), label: z.string(), text: z.string() }),
  ),
});

function Why({
  cap,
  headline,
  body,
  figures,
}: z.infer<typeof whySchema>): JSX.Element {
  return (
    <section id="why" className="chapter" data-title="Why a foundation">
      <link
        rel="stylesheet"
        href={FOUNDATION_STYLESHEET_PATH}
        precedence="page"
      />
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      {body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <dl className="figures">
        {figures.map((entry) => (
          <div key={entry.label}>
            <dt>{entry.figure}</dt>
            <dd>
              <b>{entry.label}</b>
              {inline(entry.text)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ the board ============ */

const boardSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  members: z.array(z.object({ name: z.string(), role: z.string() })),
});

function Board({
  cap,
  headline,
  members,
}: z.infer<typeof boardSchema>): JSX.Element {
  return (
    <section id="board" className="chapter" data-title="The board">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <ul className="people">
        {members.map((member) => (
          <li key={member.name}>
            <b>{member.name}</b>
            <span>{member.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ============ how to follow ============ */

const followSchema = z.object({
  cap: z.string(),
  headline: z.string(),
  links: z.array(doorSchema),
});

function Follow({
  cap,
  headline,
  links,
}: z.infer<typeof followSchema>): JSX.Element {
  return (
    <section id="follow" className="chapter" data-title="Follow">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
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

export const foundationSections: SiteSectionGroup = sectionGroup("foundation", {
  hero: defineSection(heroSchema, Hero, {
    title: "Hero",
    description: "The opening: the case, the lede and the doors",
  }),
  writing: defineSection(entriesSchema, Writing, {
    title: "Members' writing",
    description:
      "The Foundation's selection, each article on its author's Brain",
  }),
  mission: defineSection(missionSchema, Mission, {
    title: "Mission",
    description: "The mission, as a chapter of its own",
  }),
  events: defineSection(entriesSchema, Events, {
    title: "Events",
    description: "The kinds of gathering, and their dates once set",
  }),
  support: defineSection(supportSchema, Support, {
    title: "Founding supporters",
    description: "The founding ask and the two ways to give",
  }),
  why: defineSection(whySchema, Why, {
    title: "Why a foundation",
    description: "Who owns what, and the figures that can be checked",
  }),
  board: defineSection(boardSchema, Board, {
    title: "The board",
    description: "The board by name and role",
  }),
  follow: defineSection(followSchema, Follow, {
    title: "Follow",
    description: "Where the Foundation's essays and research are published",
  }),
});
