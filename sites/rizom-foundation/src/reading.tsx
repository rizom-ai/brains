import type { JSX, ReactNode } from "react";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { inline } from "./inline";
import { FOUNDATION_STYLESHEET_PATH } from "./styles";

/**
 * The reading pages (Common Sense, the founding-supporters page): one serif
 * column, each part of the text a section of its route. A page opens with
 * its head and ends with its close; the parts between are prose, steps, the
 * mission set apart, the numbered assumptions and the goals as a ledger.
 */

const doorSchema = z.object({ label: z.string(), href: z.string() });
const termSchema = z.object({ term: z.string(), text: z.string() });

function Part({
  children,
  edge,
}: {
  children: ReactNode;
  edge?: "head" | "close";
}): JSX.Element {
  return (
    <section
      className={edge ? `reading-page reading-page--${edge}` : "reading-page"}
    >
      <div className="reading">{children}</div>
    </section>
  );
}

const Paragraphs = ({ body }: { body: string[] }): JSX.Element => (
  <>
    {body.map((paragraph) => (
      <p key={paragraph}>{inline(paragraph)}</p>
    ))}
  </>
);

/* ============ the head ============ */

const headSchema = z.object({ title: z.string(), subtitle: z.string() });

function Head({ title, subtitle }: z.infer<typeof headSchema>): JSX.Element {
  return (
    <Part edge="head">
      <link
        rel="stylesheet"
        href={FOUNDATION_STYLESHEET_PATH}
        precedence="page"
      />
      <header className="reading__head">
        <h1>{title}</h1>
        <p className="reading__sub">{subtitle}</p>
      </header>
    </Part>
  );
}

/* ============ prose ============ */

const proseSchema = z.object({
  heading: z.string().default(""),
  body: z.array(z.string()).min(1),
});

function Prose({ heading, body }: z.infer<typeof proseSchema>): JSX.Element {
  return (
    <Part>
      {heading && <h2>{heading}</h2>}
      <Paragraphs body={body} />
    </Part>
  );
}

/* ============ steps: a part in named sub-parts ============ */

const stepsSchema = z.object({
  heading: z.string(),
  lede: z.string().default(""),
  items: z.array(termSchema).min(1),
  closing: z.string().default(""),
});

function Steps({
  heading,
  lede,
  items,
  closing,
}: z.infer<typeof stepsSchema>): JSX.Element {
  return (
    <Part>
      <h2>{heading}</h2>
      {lede && <p>{inline(lede)}</p>}
      {items.map((item) => (
        <div key={item.term}>
          <h3>{item.term}</h3>
          <p>{inline(item.text)}</p>
        </div>
      ))}
      {closing && <p>{inline(closing)}</p>}
    </Part>
  );
}

/* ============ the mission, set apart ============ */

const missionSchema = z.object({
  heading: z.string(),
  text: z.string(),
  body: z.array(z.string()).default([]),
});

function Mission({
  heading,
  text,
  body,
}: z.infer<typeof missionSchema>): JSX.Element {
  return (
    <Part>
      <h2>{heading}</h2>
      <p className="reading__mission">{inline(text)}</p>
      <Paragraphs body={body} />
    </Part>
  );
}

/* ============ the assumptions, numbered ============ */

const assumptionsSchema = z.object({
  heading: z.string(),
  items: z.array(z.string()).min(1),
  note: z.string().default(""),
});

function Assumptions({
  heading,
  items,
  note,
}: z.infer<typeof assumptionsSchema>): JSX.Element {
  return (
    <Part>
      <h2>{heading}</h2>
      <ol className="reading__assumptions">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      {note && <p>{inline(note)}</p>}
    </Part>
  );
}

/* ============ the goals, as a ledger ============ */

const goalsSchema = z.object({
  heading: z.string(),
  lede: z.string().default(""),
  items: z.array(termSchema).min(1),
  closing: z.string().default(""),
});

function Goals({
  heading,
  lede,
  items,
  closing,
}: z.infer<typeof goalsSchema>): JSX.Element {
  return (
    <Part>
      <h2>{heading}</h2>
      {lede && <p>{inline(lede)}</p>}
      <dl className="reading__goals">
        {items.flatMap((item) => [
          <dt key={`${item.term}-term`}>{item.term}</dt>,
          <dd key={`${item.term}-text`}>{inline(item.text)}</dd>,
        ])}
      </dl>
      {closing && <p>{inline(closing)}</p>}
    </Part>
  );
}

/* ============ the close ============ */

const closeSchema = z.object({
  text: z.string(),
  doors: z.array(doorSchema).default([]),
});

function Close({ text, doors }: z.infer<typeof closeSchema>): JSX.Element {
  return (
    <Part edge="close">
      <p className="reading__close">{inline(text)}</p>
      {doors.length > 0 && (
        <p className="reading__doors">
          {doors.map((door) => (
            <a key={door.href + door.label} href={door.href}>
              {door.label}
            </a>
          ))}
        </p>
      )}
    </Part>
  );
}

export const readingSections: SiteSectionGroup = sectionGroup("reading", {
  head: defineSection(headSchema, Head, {
    title: "Head",
    description: "A reading page's title and the line under it",
  }),
  prose: defineSection(proseSchema, Prose, {
    title: "Prose",
    description: "A part of the text: an optional heading and its paragraphs",
  }),
  steps: defineSection(stepsSchema, Steps, {
    title: "Steps",
    description: "A part in named sub-parts, with a line before and after",
  }),
  mission: defineSection(missionSchema, Mission, {
    title: "Mission",
    description: "A statement set apart from the text around it",
  }),
  assumptions: defineSection(assumptionsSchema, Assumptions, {
    title: "Assumptions",
    description: "The assumptions, numbered, and how they are tested",
  }),
  goals: defineSection(goalsSchema, Goals, {
    title: "Goals",
    description: "Goals as a ledger: what is promised and what would show it",
  }),
  close: defineSection(closeSchema, Close, {
    title: "Close",
    description: "The closing line and the doors out of the page",
  }),
});
