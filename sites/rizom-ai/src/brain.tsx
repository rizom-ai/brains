/** @jsxImportSource react */
import type { JSX } from "react";
import { defineSection, sectionGroup, z } from "@rizom/site";
import type { SiteSectionGroup } from "@rizom/site";
import { renderHighlightedText } from "./rizom";
import { ctaSchema } from "./shared";

/** Authored copy lives in rizom-content/site-content/brain. */
export function BrainStyles(): JSX.Element {
  return <link rel="stylesheet" href="/styles/brain.css" precedence="page" />;
}
const lead = {
  cap: z.string(),
  headline: z.string(),
  body: z.array(z.string()).min(1),
};
const asideSchema = z.object({
  text: z.string(),
  links: z.array(ctaSchema).max(1),
});
const captureSchema = z.object({
  kind: z.enum(["chat", "network"]),
  alt: z.string(),
  caption: z.string(),
  openLabel: z.string(),
});
const chapterSchema = z.object({
  ...lead,
  aside: asideSchema,
  capture: captureSchema,
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
const capabilitiesSchema = z.object({
  ...lead,
  aside: asideSchema,
  code: codeSchema,
});
const heroSchema = z.object({
  ...lead,
  provenance: z.string(),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  command: z.string(),
  footnote: z.string(),
  chat: z.object({
    title: z.string(),
    inputHint: z.string(),
    notice: z.string(),
    topicsLabel: z.string(),
    topics: z.array(z.string()).min(1),
  }),
  navigation: z.array(ctaSchema).length(4),
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
        <p key={text} className="copy">
          {renderHighlightedText(text, "heading-emphasis")}
        </p>
      ))}
    </>
  );
}
function Aside({ text, links }: z.infer<typeof asideSchema>): JSX.Element {
  return (
    <p className="aside">
      {text}
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {" "}
          {link.label}
        </a>
      ))}
    </p>
  );
}
function Code({ title, note, lines }: z.infer<typeof codeSchema>): JSX.Element {
  return (
    <div className="term" role="figure" aria-label={title}>
      <div className="term-bar">
        <span>{title}</span>
        <span>{note}</span>
      </div>
      <pre>
        <code>
          {lines.map((line, index) => (
            <span key={index} className={`code-line code-${line.kind}`}>
              {" ".repeat(line.indent)}
              {line.text}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
function Capture({
  kind,
  alt,
  caption,
  openLabel,
}: z.infer<typeof captureSchema>): JSX.Element {
  return (
    <figure>
      <div className="interface">
        {["dark", "light"].map((theme) =>
          (kind === "chat" ? ["desktop", "mobile"] : ["desktop"]).map(
            (size) => {
              const name =
                kind === "chat" ? `chat-${size}-${theme}` : `network-${theme}`;
              const width =
                kind === "network" ? 2004 : size === "mobile" ? 780 : 2244;
              const height =
                kind === "network" ? 1122 : size === "mobile" ? 1302 : 1058;
              return (
                <a
                  key={name}
                  className={`capture-link capture-${theme} ${kind === "chat" ? `capture-${size}` : ""}`}
                  href={`/images/brain/${name}.svg`}
                  target="_blank"
                  rel="noopener"
                  aria-label={openLabel}
                >
                  <img
                    src={`/images/brain/${name}.svg`}
                    width={width}
                    height={height}
                    loading="lazy"
                    alt={alt}
                  />
                </a>
              );
            },
          ),
        )}
      </div>
      <figcaption className="caption">{caption}</figcaption>
    </figure>
  );
}
function Hero(data: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <>
      <section
        className="hero shell"
        id="brain-hero"
        aria-labelledby="brain-heading"
      >
        <div className="hero-grid">
          <div>
            <p className="eyebrow">
              {data.cap}
              <small>{data.provenance}</small>
            </p>
            <h1 id="brain-heading">
              {renderHighlightedText(data.headline, "heading-emphasis")}
            </h1>
            <Copy paragraphs={data.body} />
            <div className="actions">
              <a className="button" href={data.primaryCta.href}>
                {data.primaryCta.label}
              </a>
              <a className="text-link" href={data.secondaryCta.href}>
                {data.secondaryCta.label}
              </a>
            </div>
            <p className="hero-note mono">
              <b>{data.command}</b> · {data.footnote}
            </p>
          </div>
          <div className="hero-visual">
            {/* Intentionally not a form. No input is collected or submitted until /ask is ready. */}
            <div
              className="interface talk"
              id="brain-chat"
              role="region"
              aria-labelledby="brain-chat-heading"
            >
              <div className="ui-bar">
                <span className="brand">rizom.ai</span>
              </div>
              <div className="talk-body">
                <h2 id="brain-chat-heading" className="display">
                  {data.chat.title}
                </h2>
                <p id="brain-chat-notice" className="chat-notice">
                  {data.chat.notice}
                </p>
                <p className="prompt-row">
                  <input
                    type="text"
                    disabled
                    placeholder={data.chat.inputHint}
                    aria-label={data.chat.title}
                    aria-describedby="brain-chat-notice"
                  />
                  <span className="send" aria-hidden="true">
                    ↑
                  </span>
                </p>
                <p className="hints">
                  {data.chat.topicsLabel}
                  {data.chat.topics.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <nav className="chapter-nav shell" aria-label="What a brain does">
        {data.navigation.map((link, index) => (
          <a key={link.href} href={link.href}>
            <span className="number">{String(index + 1).padStart(2, "0")}</span>
            {link.label}
            <span className="arrow" aria-hidden="true">
              ↓
            </span>
          </a>
        ))}
      </nav>
    </>
  );
}
function Chapter({
  id,
  data,
}: {
  id: string;
  data: z.infer<typeof chapterSchema>;
}): JSX.Element {
  return (
    <section
      className="chapter shell"
      id={id}
      aria-labelledby={`${id}-heading`}
    >
      <div className="chapter-grid">
        <div className="chapter-copy">
          <p className="eyebrow">{data.cap}</p>
          <h2 id={`${id}-heading`}>
            {renderHighlightedText(data.headline, "heading-emphasis")}
          </h2>
          <Copy paragraphs={data.body} />
          <Aside {...data.aside} />
        </div>
        <Capture {...data.capture} />
      </div>
    </section>
  );
}
function Answers(data: z.infer<typeof chapterSchema>): JSX.Element {
  return <Chapter id="answers" data={data} />;
}
function Collective(data: z.infer<typeof chapterSchema>): JSX.Element {
  return <Chapter id="collective" data={data} />;
}
function Capabilities(data: z.infer<typeof capabilitiesSchema>): JSX.Element {
  return (
    <section
      className="chapter shell"
      id="capabilities"
      aria-labelledby="capabilities-heading"
    >
      <div className="chapter-grid flip">
        <div className="chapter-copy">
          <p className="eyebrow">{data.cap}</p>
          <h2 id="capabilities-heading">
            {renderHighlightedText(data.headline, "heading-emphasis")}
          </h2>
          <Copy paragraphs={data.body} />
          <Aside {...data.aside} />
        </div>
        <div className="configuration">
          <Code {...data.code} />
        </div>
      </div>
    </section>
  );
}
function Layers(data: z.infer<typeof layersSchema>): JSX.Element {
  return (
    <section className="layers shell" aria-label={data.label}>
      {data.items.map((item) => (
        <div className="layer" key={item.title}>
          <div className="layer-head">
            <h3>{item.title}</h3>
            <span className="layer-tag">{item.tag}</span>
          </div>
          <p>{item.text}</p>
        </div>
      ))}
    </section>
  );
}
function Ownership(data: z.infer<typeof ownershipSchema>): JSX.Element {
  return (
    <section
      className="shell ownership"
      id="yours"
      aria-labelledby="yours-heading"
    >
      <div className="principles-head">
        <p className="eyebrow">{data.cap}</p>
        <h2 id="yours-heading">
          {renderHighlightedText(data.headline, "heading-emphasis")}
        </h2>
        <Copy paragraphs={data.body} />
      </div>
      <div className="principles">
        {data.items.map((item) => (
          <div key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
function Quickstart(data: z.infer<typeof quickstartSchema>): JSX.Element {
  return (
    <section
      className="start shell"
      id="quickstart"
      aria-labelledby="start-heading"
    >
      <div className="start-grid">
        <div>
          <p className="eyebrow">{data.cap}</p>
          <h2 id="start-heading">
            {renderHighlightedText(data.headline, "heading-emphasis")}
          </h2>
          <Copy paragraphs={data.body} />
          <Code {...data.code} />
        </div>
        <div>
          {data.options.map((option, index) => (
            <div className="start-option" key={option.title}>
              <p className="ui-label">{option.cap}</p>
              <h3>{option.title}</h3>
              <p>{option.text}</p>
              <a
                className={index === 0 ? "button" : "text-link"}
                href={option.cta.href}
              >
                {option.cta.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Preserve durable section IDs. Display titles and DOM anchors describe the new composition.
// The former closing content remains in the content repository, unrouted; its CTA is now in Quickstart.
export const brainSections: SiteSectionGroup = sectionGroup("brain", {
  hero: defineSection(heroSchema, Hero, {
    title: "Hero",
    description:
      "Owned-agent introduction and non-sending public chat placeholder",
  }),
  capture: defineSection(chapterSchema, Answers, {
    title: "Answers",
    description: "Source-grounded answers through the brain and its clients",
  }),
  ask: defineSection(capabilitiesSchema, Capabilities, {
    title: "Capabilities",
    description: "Core abilities and configurable bundles",
  }),
  connect: defineSection(chapterSchema, Collective, {
    title: "Collective",
    description: "Shared work between independently owned brains",
  }),
  run: defineSection(layersSchema, Layers, {
    title: "You, Team, Network",
    description: "Individual, team and network ownership",
  }),
  "your-data": defineSection(ownershipSchema, Ownership, {
    title: "Stays Yours",
    description: "Portable content, provider choice and open software",
  }),
  quickstart: defineSection(quickstartSchema, Quickstart, {
    title: "Quick Start",
    description: "Installation and knowledge-session entry points",
  }),
});
