/** @jsxImportSource react */
import type { JSX } from "react";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { answeredBy } from "@brains/contracts";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { createTemplate, type Template } from "@brains/templates";
import { MarkdownContent } from "@rizom/brain-ui";
import { z } from "@rizom/site";

/**
 * "Asked before": visitors' questions the owner kept and published, most
 * asked first, each opening on the answer, who answered, and the sources in
 * their owners' words. The chapter follows the Ask room on /ask: the questions others
 * asked, under the box for your own. Opening a question lights the brains
 * its answer drew on in the page's live drawing (see ./story/runtime);
 * counts sort the list and are never shown.
 */
type AskedSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodNullable<z.ZodString>;
  excerpt: z.ZodNullable<z.ZodString>;
  brain: z.ZodNullable<
    z.ZodObject<{ name: z.ZodString; url: z.ZodNullable<z.ZodString> }>
  >;
}>;

const askedSourceSchema: AskedSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  excerpt: z.string().nullable(),
  brain: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
});

export const askedFaqSchema: z.ZodObject<{
  id: z.ZodString;
  question: z.ZodString;
  answer: z.ZodString;
  asked: z.ZodNumber;
  sources: z.ZodArray<AskedSourceSchema>;
}> = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  asked: z.number().int(),
  sources: z.array(askedSourceSchema),
});

/** The chapter's own words, authored as a content section like every chapter's. */
type AskedCopySchema = z.ZodObject<{
  cap: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  claim: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  body: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}>;

export const askedCopySchema: AskedCopySchema = z.object({
  /** The eyebrow. */
  cap: z.string().nullable().default(null),
  /** The heading. */
  claim: z.string().nullable().default(null),
  /** The line under the heading. */
  body: z.string().nullable().default(null),
});

const DEFAULT_COPY = {
  cap: "Asked before",
  claim: "What people ask the network",
  body: "Questions visitors put to Rizom, answered from the connected brains and kept by the owner. Open one: the brains that answered light up.",
};

/** The published FAQs, with the live network's data for the brains they name. */
export const askedSchema: z.ZodObject<
  (typeof proximityMapDataSchema)["shape"] &
    AskedCopySchema["shape"] & {
      faqs: z.ZodArray<typeof askedFaqSchema>;
    }
> = proximityMapDataSchema.extend({
  ...askedCopySchema.shape,
  faqs: z.array(askedFaqSchema),
});

export type AskedData = z.output<typeof askedSchema>;
type AskedSource = z.output<typeof askedSourceSchema>;

const OWNER = "Rizom";

/** What the drawing needs of a kept source: its key, title and brain. */
function forDrawing(sources: AskedSource[]): string {
  return JSON.stringify(
    sources.map((source) => ({
      id: source.id,
      title: source.title,
      ...(source.brain
        ? {
            brain: {
              name: source.brain.name,
              ...(source.brain.url ? { url: source.brain.url } : {}),
            },
          }
        : {}),
    })),
  );
}

function Sources({ sources }: { sources: AskedSource[] }): JSX.Element | null {
  if (sources.length === 0) return null;
  const brains = sources.flatMap((source) =>
    source.brain ? [source.brain.name] : [],
  );
  return (
    <>
      {brains.length > 0 && (
        <p className="asked__by">{answeredBy(OWNER, brains)}</p>
      )}
      <ul className="asked__sources" aria-label="Sources">
        {sources.map((source) => (
          <li
            key={source.id}
            data-ask-source={source.id}
            {...(source.brain ? { "data-ask-brain": source.brain.name } : {})}
          >
            <span className="asked__mark" aria-hidden="true" />
            <span className="asked__piece">
              {source.brain && <b>{source.brain.name}</b>}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              ) : (
                <span>{source.title}</span>
              )}
            </span>
            {source.excerpt && <q>{source.excerpt}</q>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Asked(data: AskedData): JSX.Element {
  const { faqs } = data;
  if (faqs.length === 0) return <></>;
  return (
    <section
      id="asked"
      className="chapter asked"
      data-title="Asked before"
      data-lights-network=""
    >
      <p className="eyebrow">{data.cap ?? DEFAULT_COPY.cap}</p>
      <h2>{data.claim ?? DEFAULT_COPY.claim}</h2>
      <p>{data.body ?? DEFAULT_COPY.body}</p>
      <div className="asked__list">
        {faqs.map((faq) => (
          <details
            key={faq.id}
            name="asked"
            data-ask-answer={forDrawing(faq.sources)}
          >
            <summary>{faq.question}</summary>
            <div className="asked__answer">
              <MarkdownContent markdown={faq.answer} />
              <Sources sources={faq.sources} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// The chapter's words, edited as an ordinary markdown section and spliced
// over the live FAQs by the content overlay.
const askedCopyFormatter = new StructuredContentFormatter(askedCopySchema, {
  title: "Asked before",
  mappings: [
    { key: "cap", label: "Cap", type: "string" },
    { key: "claim", label: "Claim", type: "string" },
    { key: "body", label: "Body", type: "string" },
  ],
});

export const askedTemplate: Template = createTemplate({
  name: "asked",
  description:
    "Asked before: the visitors' questions the owner kept, with their answers and sources",
  schema: askedSchema,
  dataSourceId: "rizom:asked",
  overlayFormatter: askedCopyFormatter,
  requiredPermission: "public",
  layout: { component: Asked },
});
