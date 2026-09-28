/** @jsxImportSource react */
import { Fragment, type JSX } from "react";
import { defineSection, sectionGroup, z } from "@rizom/site";
import type { SiteSectionGroup } from "@rizom/site";
import { ctaSchema } from "./shared";
import { emphasize } from "./story/emphasis";

/**
 * The /brain room, told as a story: the agent that represents you, the
 * answers it gives, what it is equipped for, whose it is (yours, your team's,
 * the network's), the collective, what stays yours and how to start, each a
 * chapter beside the drawing the layout supplies (see ./story/brain-organism).
 * Each section is authored from one zod schema; copy is content-driven,
 * stored as markdown in site-content/brain/<section>.md, and the section ids
 * stay stable. The DOM anchors are the ones the content links to.
 */

const lead = {
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
};
const asideSchema = z.object({
  text: z.string(),
  links: z.array(ctaSchema).max(1),
});
const chapterSchema = z.object({ ...lead, aside: asideSchema });
const heroSchema = z.object({
  ...lead,
  provenance: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
});
const layersSchema = z.object({
  label: z.string(),
  items: z
    .array(z.object({ title: z.string(), tag: z.string(), text: z.string() }))
    .length(3),
});
const ownershipSchema = z.object({
  ...lead,
  items: z.array(z.object({ title: z.string(), text: z.string() })).length(3),
});
const codeSchema = z.object({
  title: z.string(),
  note: z.string(),
  lines: z
    .array(
      z.object({
        text: z.string(),
        indent: z.number().int().min(0).max(8),
        kind: z.enum(["code", "comment", "optional"]),
      }),
    )
    .min(1),
});
const quickstartSchema = z.object({
  ...lead,
  code: codeSchema,
  options: z
    .array(
      z.object({
        cap: z.string(),
        title: z.string(),
        text: z.string(),
        cta: ctaSchema,
      }),
    )
    .length(2),
});

function Copy({ paragraphs }: { paragraphs: string[] }): JSX.Element {
  return (
    <>
      {paragraphs.map((text) => (
        <p key={text}>{emphasize(text)}</p>
      ))}
    </>
  );
}
function Aside({ text, links }: z.infer<typeof asideSchema>): JSX.Element {
  return (
    <p className="aside">
      {text}
      {links.map((link) => (
        <Fragment key={link.href}>
          {" "}
          <a href={link.href}>{link.label}</a>
        </Fragment>
      ))}
    </p>
  );
}
/** The terminal: comments and optional lines dimmed, the prompt lit. */
function Code({ title, lines }: z.infer<typeof codeSchema>): JSX.Element {
  return (
    <pre className="code" aria-label={title}>
      {lines.map((line, index) => {
        const text = `${" ".repeat(line.indent)}${line.text}`;
        return (
          <span key={index} className={`code-${line.kind}`}>
            {line.kind !== "code" ? (
              <i>{text}</i>
            ) : text.startsWith("$ ") ? (
              <>
                <b>$</b>
                {text.slice(1)}
              </>
            ) : (
              text
            )}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

/* ============ the opening ============ */

function Hero({
  cap,
  headline,
  body,
  primaryCta,
  secondaryCta,
}: z.infer<typeof heroSchema>): JSX.Element {
  const [lede, ...rest] = body;
  return (
    <section id="brain-hero" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h1>{emphasize(headline)}</h1>
      <p className="lede">{lede}</p>
      <Copy paragraphs={rest} />
      <p className="doors-in">
        <a href={primaryCta.href}>{primaryCta.label}</a>
        <a href={secondaryCta.href}>{secondaryCta.label}</a>
      </p>
    </section>
  );
}

/* ============ answers, capabilities, the collective ============ */

function Chapter({
  id,
  data,
}: {
  id: string;
  data: z.infer<typeof chapterSchema>;
}): JSX.Element {
  return (
    <section id={id} className="chapter">
      <p className="eyebrow">{data.cap}</p>
      <h2>{emphasize(data.headline)}</h2>
      <Copy paragraphs={data.body} />
      <Aside {...data.aside} />
    </section>
  );
}
const Answers = (data: z.infer<typeof chapterSchema>): JSX.Element => (
  <Chapter id="answers" data={data} />
);
const Capabilities = (data: z.infer<typeof chapterSchema>): JSX.Element => (
  <Chapter id="capabilities" data={data} />
);
const Collective = (data: z.infer<typeof chapterSchema>): JSX.Element => (
  <Chapter id="collective" data={data} />
);

/* ============ you, team, network ============ */

function Layers({ label, items }: z.infer<typeof layersSchema>): JSX.Element {
  return (
    <section id="run" className="chapter" data-title={label}>
      <p className="eyebrow">{label}</p>
      <dl className="parts">
        {items.map((item) => (
          <div key={item.title}>
            <dt>
              {item.title} <span className="status">{item.tag}</span>
            </dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ stays yours ============ */

function Ownership({
  cap,
  headline,
  body,
  items,
}: z.infer<typeof ownershipSchema>): JSX.Element {
  return (
    <section id="yours" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <Copy paragraphs={body} />
      <dl className="parts">
        {items.map((item) => (
          <div key={item.title}>
            <dt>{item.title}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ quick start ============ */

function Quickstart({
  cap,
  headline,
  body,
  code,
  options,
}: z.infer<typeof quickstartSchema>): JSX.Element {
  return (
    <section id="quickstart" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(headline)}</h2>
      <Copy paragraphs={body} />
      <Code {...code} />
      <div className="doors">
        {options.map((option) => (
          <a
            key={option.title}
            className={
              option.cta.href.startsWith("/work") ? "door door--work" : "door"
            }
            href={option.cta.href}
          >
            <span className="door__room">{option.cap}</span>
            <span className="door__title">{option.title}</span>
            <span className="door__text">{option.text}</span>
            <span className="door__go">{option.cta.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// The section ids are content identity. The old closing content stays in
// the content repository, unrouted; its doors are Quickstart's.
export const brainSections: SiteSectionGroup = sectionGroup("brain", {
  hero: defineSection(heroSchema, Hero, {
    title: "Hero",
    description: "The opening: the agent that represents you, and two doors",
  }),
  capture: defineSection(chapterSchema, Answers, {
    title: "Answers",
    description: "Source-grounded answers through the brain and its clients",
  }),
  ask: defineSection(chapterSchema, Capabilities, {
    title: "Capabilities",
    description: "Core abilities and configurable bundles",
  }),
  run: defineSection(layersSchema, Layers, {
    title: "You, Team, Network",
    description: "Individual, team and network ownership",
  }),
  connect: defineSection(chapterSchema, Collective, {
    title: "Collective",
    description: "Different knowledge, shared work, across owned brains",
  }),
  "your-data": defineSection(ownershipSchema, Ownership, {
    title: "Stays Yours",
    description: "Portable content, provider choice and open software",
  }),
  quickstart: defineSection(quickstartSchema, Quickstart, {
    title: "Quick Start",
    description: "The terminal and the two ways to start",
  }),
});
