/** @jsxImportSource react */
import type { JSX } from "react";
import { defineSection, sectionGroup, z } from "@rizom/site";
import type { SiteSectionGroup } from "@rizom/site";
import { renderHighlightedText } from "./rizom";
import { ctaSchema } from "./shared";
import { emphasize } from "./story/emphasis";

/**
 * The homepage's story, chapter by chapter beside the living organism the
 * layout supplies (see ./story/living-organism): the science, the shift, the
 * organism, where this goes and the two ways in. The opening is its own
 * template (see ./opening). Each section is authored from one zod schema;
 * copy is content-driven, stored as markdown in
 * rizom-content/site-content/living-memory, and the section ids stay stable.
 * The problem and the system keep their templates for their content files,
 * though the homepage no longer routes them: /work and /brain tell them.
 */

const lead = {
  cap: z.string(),
  claim: z.string(),
  body: z.array(z.string()).min(1),
};
function Copy({ paragraphs }: { paragraphs: string[] }): JSX.Element {
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>
          {renderHighlightedText(
            paragraph,
            "font-medium not-italic text-theme",
          )}
        </p>
      ))}
    </>
  );
}

/* ============ the problem (unrouted; /work tells it) ============ */

const problemSchema = z.object({
  cap: z.string(),
  items: z.array(z.object({ title: z.string(), text: z.string() })).length(3),
});
function ProblemSection({
  cap,
  items,
}: z.infer<typeof problemSchema>): JSX.Element {
  return (
    <section id="problem" className="chapter">
      <p className="eyebrow">{cap}</p>
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

/* ============ the science ============ */

const dimensionSchema = z.object({
  name: z.string(),
  title: z.string(),
  emphasis: z.string(),
  text: z.string(),
});
const scienceSchema = z.object({
  ...lead,
  dimensions: z.array(dimensionSchema).length(3),
});
function ScienceSection({
  cap,
  claim,
  body,
  dimensions,
}: z.infer<typeof scienceSchema>): JSX.Element {
  return (
    <section id="science" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(claim)}</h2>
      <Copy paragraphs={body} />
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

/* ============ the shift ============ */

const turnSchema = z.object({
  cap: z.string(),
  quote: z.string(),
  emphasis: z.string(),
  body: z.array(z.string()).min(1),
});
function TurnSection({
  cap,
  quote,
  emphasis,
  body,
}: z.infer<typeof turnSchema>): JSX.Element {
  return (
    <section id="turn" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>
        {quote} <em>{emphasis}</em>
      </h2>
      <Copy paragraphs={body} />
    </section>
  );
}

/* ============ the system (unrouted; /brain tells it) ============ */

const systemSchema = z.object({
  ...lead,
  availability: z.string(),
  comparison: z.object({
    beforeLabel: z.string(),
    beforeTitle: z.string(),
    afterLabel: z.string(),
    afterTitle: z.string(),
    rows: z.array(z.object({ before: z.string(), after: z.string() })).min(1),
  }),
});
function SystemSection({
  cap,
  claim,
  body,
  availability,
  comparison,
}: z.infer<typeof systemSchema>): JSX.Element {
  return (
    <section id="system" className="chapter">
      <p className="eyebrow">
        {cap} <span className="status">{availability}</span>
      </p>
      <h2>{emphasize(claim)}</h2>
      <Copy paragraphs={body} />
      <dl className="parts">
        {comparison.rows.map((row) => (
          <div key={row.before}>
            <dt>{row.after}</dt>
            <dd>
              {comparison.beforeTitle}: {row.before}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ============ one organism: the site's rooms ============ */

const growthSchema = z.object({
  cap: z.string(),
  claim: z.string(),
  stages: z
    .array(z.object({ key: z.string(), title: z.string(), text: z.string() }))
    .length(3),
});
// The three parts are the site's rooms; the network is the opening above.
const ROOMS: Record<string, string> = {
  You: "/brain",
  Team: "/work",
  Network: "#hero",
};
function GrowthSection({
  cap,
  claim,
  stages,
}: z.infer<typeof growthSchema>): JSX.Element {
  return (
    <section id="growth" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(claim)}</h2>
      <dl className="parts">
        {stages.map((stage) => {
          const href = ROOMS[stage.key];
          return (
            <div key={stage.key}>
              <dt>{href ? <a href={href}>{stage.title}</a> : stage.title}</dt>
              <dd>{stage.text}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/* ============ where this goes ============ */

const arcSchema = z.object({
  cap: z.string(),
  claim: z.string(),
  rows: z
    .array(
      z.object({
        no: z.string(),
        kicker: z.string(),
        title: z.string(),
        text: z.string(),
        meta: z.string(),
      }),
    )
    .length(3),
});
function ArcSection({
  cap,
  claim,
  rows,
}: z.infer<typeof arcSchema>): JSX.Element {
  return (
    <section id="arc" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(claim)}</h2>
      <dl className="parts">
        {rows.map((row) => (
          <div key={row.no}>
            <dt>
              {row.title} <span className="status">{row.meta}</span>
            </dt>
            <dd>{row.text}</dd>
          </div>
        ))}
      </dl>
      <p className="onward">
        <a href="/foundation">The research behind it, at the Foundation</a>
      </p>
    </section>
  );
}

/* ============ two ways in ============ */

const doorsSchema = z.object({
  ...lead,
  doors: z
    .array(
      z.object({
        room: z.enum(["work", "platform"]),
        key: z.string(),
        title: z.string(),
        text: z.string(),
        cta: ctaSchema,
      }),
    )
    .length(2),
});
function DoorsSection({
  cap,
  claim,
  body,
  doors,
}: z.infer<typeof doorsSchema>): JSX.Element {
  return (
    <section id="doors" className="chapter">
      <p className="eyebrow">{cap}</p>
      <h2>{emphasize(claim)}</h2>
      <Copy paragraphs={body} />
      <div className="doors">
        {doors.map((door) => (
          <a
            key={door.key}
            className={door.room === "work" ? "door door--work" : "door"}
            href={door.cta.href}
          >
            <span className="door__room">{door.key}</span>
            <span className="door__title">{door.title}</span>
            <span className="door__text">{door.text}</span>
            <span className="door__go">{door.cta.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ============ the living-memory section group ============ */

export const livingMemorySections: SiteSectionGroup = sectionGroup(
  "living-memory",
  {
    problem: defineSection(problemSchema, ProblemSection, {
      title: "Problem",
      description:
        "Three consequences of disconnected knowledge (told on /work)",
    }),
    science: defineSection(scienceSchema, ScienceSection, {
      title: "Science",
      description: "Transactive memory and its three dimensions",
    }),
    turn: defineSection(turnSchema, TurnSection, {
      title: "Turn",
      description: "The shift to hybrid teams",
    }),
    system: defineSection(systemSchema, SystemSection, {
      title: "System",
      description: "Documentation compared with living memory (told on /brain)",
    }),
    growth: defineSection(growthSchema, GrowthSection, {
      title: "Growth",
      description: "One organism: the brain, the practice and the network",
    }),
    arc: defineSection(arcSchema, ArcSection, {
      title: "Arc",
      description: "Measure, connect, coordinate, with honest status labels",
    }),
    doors: defineSection(doorsSchema, DoorsSection, {
      title: "Doors",
      description: "A Knowledge Audit or the open-source platform",
    }),
  },
);
