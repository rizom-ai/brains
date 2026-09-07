/** @jsxImportSource react */
import type { JSX } from "react";
import { defineSection, sectionGroup, z } from "@rizom/site";
import type { SiteSectionGroup } from "@rizom/site";
import { renderHighlightedText } from "./rizom";
import { ctaSchema } from "./shared";
import {
  LanternMark,
  OrganismDefs,
  OrganismMap,
  BrainMark,
  PracticeMark,
  NetworkMark,
} from "./living-memory-art";

/** Rendering lives here; authored values live in rizom-content/site-content/living-memory. */
export function LivingMemoryStyles(): JSX.Element {
  return (
    <link rel="stylesheet" href="/styles/living-memory.css" precedence="page" />
  );
}

const lead = {
  cap: z.string(),
  claim: z.string(),
  body: z.array(z.string()).min(1),
};
function Copy({ paragraphs }: { paragraphs: string[] }): JSX.Element {
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p className="copy" key={paragraph}>
          {renderHighlightedText(
            paragraph,
            "font-medium not-italic text-theme",
          )}
        </p>
      ))}
    </>
  );
}
const problemSchema = z.object({
  cap: z.string(),
  items: z.array(z.object({ title: z.string(), text: z.string() })).length(3),
});
function ProblemSection({
  cap,
  items,
}: z.infer<typeof problemSchema>): JSX.Element {
  return (
    <section
      className="problem-strip shell"
      id="problem"
      aria-labelledby="problem-heading"
    >
      <h2 className="eyebrow" id="problem-heading">
        {cap}
      </h2>
      <div className="problem-grid">
        {items.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

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
    <section
      className="section shell"
      id="science"
      aria-labelledby="science-heading"
    >
      <div className="science-grid">
        <div className="science-copy">
          <p className="eyebrow">{cap}</p>
          <h2 className="heading" id="science-heading">
            {renderHighlightedText(claim, "heading-emphasis")}
          </h2>
          <Copy paragraphs={body} />
        </div>
        <div className="lantern">
          <section
            className="card"
            data-active="0"
            aria-label="Three dimensions of transactive memory"
          >
            <header className="meta">
              <span className="meta-name">Transactive memory</span>
              <span className="meta-index" aria-hidden="true">
                <span className="meta-current">01</span> / 03
              </span>
            </header>
            <div className="stage" aria-hidden="true">
              <LanternMark />
            </div>
            <div className="panels">
              {dimensions.map((dimension, index) => (
                <section
                  className="panel"
                  id={`panel-${index}`}
                  key={dimension.name}
                  role="tabpanel"
                  aria-labelledby={`tab-${index}`}
                  aria-hidden={index !== 0}
                  tabIndex={index === 0 ? 0 : -1}
                >
                  <h3 className="title">
                    {dimension.title} <em>{dimension.emphasis}</em>
                  </h3>
                  <p className="body">{dimension.text}</p>
                </section>
              ))}
            </div>
            <div
              className="tabs"
              role="tablist"
              aria-label="Dimensions of transactive memory"
            >
              {dimensions.map((dimension, index) => (
                <button
                  className="tab"
                  id={`tab-${index}`}
                  key={dimension.name}
                  type="button"
                  role="tab"
                  aria-controls={`panel-${index}`}
                  aria-selected={index === 0}
                  tabIndex={index === 0 ? 0 : -1}
                >
                  <span className="tab-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {dimension.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

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
    <section className="turn" aria-labelledby="turn-heading">
      <div className="shell">
        <p className="eyebrow" id="turn-heading">
          {cap}
        </p>
        <blockquote>
          <span className="turn-intro">{quote}</span>{" "}
          <em className="turn-emphasis">{emphasis}</em>
        </blockquote>
        <div className="turn-bottom">
          <Copy paragraphs={body} />
        </div>
      </div>
    </section>
  );
}

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
    <section
      className="section shell"
      id="system"
      aria-labelledby="system-heading"
    >
      <div className="section-intro">
        <div>
          <p className="eyebrow">
            {cap}
            <span className="availability">{availability}</span>
          </p>
          <h2 className="heading" id="system-heading">
            {renderHighlightedText(claim, "heading-emphasis")}
          </h2>
        </div>
        <div>
          <Copy paragraphs={body} />
        </div>
      </div>
      <table
        className="comparison"
        aria-label="Documentation compared with living memory"
      >
        <thead>
          <tr>
            <th scope="col">
              <span className="small-label">{comparison.beforeLabel}</span>
              <span className="comparison-title">{comparison.beforeTitle}</span>
            </th>
            <th scope="col">
              <span className="small-label">{comparison.afterLabel}</span>
              <span className="comparison-title">{comparison.afterTitle}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.before}>
              <td>{row.before}</td>
              <td>{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const growthSchema = z.object({
  cap: z.string(),
  claim: z.string(),
  stages: z
    .array(z.object({ key: z.string(), title: z.string(), text: z.string() }))
    .length(3),
});
const stageArt = [
  { className: "organism-brain", Mark: BrainMark },
  { className: "organism-team", Mark: PracticeMark },
  { className: "organism-network", Mark: NetworkMark },
];
function GrowthSection({
  cap,
  claim,
  stages,
}: z.infer<typeof growthSchema>): JSX.Element {
  return (
    <section
      className="section organism shell"
      id="growth"
      aria-labelledby="organism-heading"
    >
      <p className="eyebrow">{cap}</p>
      <h2 className="heading" id="organism-heading">
        {renderHighlightedText(claim, "heading-emphasis")}
      </h2>
      <OrganismDefs />
      <OrganismMap />
      <div className="organism-stages">
        {stages.map((stage, index) => {
          const art = stageArt[index];
          if (!art) throw new Error("Missing organism illustration");
          return (
            <article
              className={`organism-stage ${art.className}`}
              key={stage.key}
            >
              <art.Mark />
              <div>
                <p className="small-label">{stage.key}</p>
                <h3>{stage.title}</h3>
                <p className="copy">{stage.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
    <section
      className="section arc shell"
      id="arc"
      aria-labelledby="arc-heading"
    >
      <div className="arc-header">
        <p className="eyebrow">{cap}</p>
        <h2 className="heading" id="arc-heading">
          {renderHighlightedText(claim, "heading-emphasis")}
        </h2>
      </div>
      <div className="roadmap">
        {rows.map((row) => (
          <article key={row.no}>
            <div className="step">
              <span className="step-number" aria-hidden="true">
                {row.no}
              </span>
              <p className="small-label">{row.kicker}</p>
            </div>
            <h3>{row.title}</h3>
            <details className="roadmap-detail" open>
              <summary>
                Read more<span className="sr-only">: {row.title}</span>
              </summary>
              <p className="copy">{row.text}</p>
            </details>
            <p className="status">{row.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

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
    <section
      className="section doors shell"
      id="doors"
      aria-labelledby="doors-heading"
    >
      <div className="doors-header">
        <p className="eyebrow">{cap}</p>
        <h2 className="heading" id="doors-heading">
          {renderHighlightedText(claim, "heading-emphasis")}
        </h2>
        <div>
          <Copy paragraphs={body} />
        </div>
      </div>
      <div className="entries">
        {doors.map((door) => (
          <article className="entry" data-room={door.room} key={door.key}>
            <p className="small-label">{door.key}</p>
            <h3>{door.title}</h3>
            <p className="copy">{door.text}</p>
            <a
              className={door.room === "work" ? "button" : "text-link"}
              href={door.cta.href}
            >
              {door.cta.label}
              <span aria-hidden="true">↗</span>
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export const livingMemorySections: SiteSectionGroup = sectionGroup(
  "living-memory",
  {
    problem: defineSection(problemSchema, ProblemSection, {
      title: "Problem",
      description: "Three consequences of disconnected knowledge",
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
      description: "Paired comparison of documentation and living memory",
    }),
    growth: defineSection(growthSchema, GrowthSection, {
      title: "Growth",
      description: "One connected brain, practice, and network",
    }),
    arc: defineSection(arcSchema, ArcSection, {
      title: "Arc",
      description: "Measure, connect, coordinate, with honest status labels",
    }),
    doors: defineSection(doorsSchema, DoorsSection, {
      title: "Doors",
      description: "A knowledge session or the open-source platform",
    }),
  },
);
