/** @jsxImportSource react */
import type { JSX } from "react";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import { createTemplate, type Template } from "@brains/templates";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@rizom/site";
import { NetworkLayer } from "./opening";
import { placeNetwork } from "./story/network";

/**
 * "Asked before": visitors' questions the owner kept and published, most
 * asked first, each opening on the answer, who answered, and the sources in
 * their owners' words. The chapter follows "Where this goes" and precedes the
 * doors: the reader has seen the argument and has their own doubts before
 * being asked to choose. Opening a question lights the brains its answer
 * drew on in the live drawing (see ./story/runtime); counts sort the list
 * and are never shown.
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

/** The published FAQs over the live network, which the chapter draws beside them. */
export const askedSchema: z.ZodObject<
  (typeof proximityMapDataSchema)["shape"] & {
    faqs: z.ZodArray<typeof askedFaqSchema>;
  }
> = proximityMapDataSchema.extend({ faqs: z.array(askedFaqSchema) });

export type AskedData = z.output<typeof askedSchema>;
type AskedSource = z.output<typeof askedSourceSchema>;

const OWNER = "Rizom";

/** "Rizom, with Becca and Jo": the brains an answer drew on, after the one answering. */
export function answeredBy(brains: readonly string[]): string {
  const names = brains.filter((name, i) => brains.indexOf(name) === i);
  if (names.length === 0) return OWNER;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${OWNER}, with ${list}`;
}

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
      {brains.length > 0 && <p className="asked__by">{answeredBy(brains)}</p>}
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
      <p className="eyebrow">Asked before</p>
      <h2>What people ask the network</h2>
      <p>
        Questions visitors put to Rizom, answered from the connected brains and
        kept by the owner. Open one: the brains that answered light up.
      </p>
      <NetworkLayer {...placeNetwork(data)} />
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

export const askedTemplate: Template = createTemplate({
  name: "asked",
  description:
    "Asked before: the visitors' questions the owner kept, with their answers and sources",
  schema: askedSchema,
  dataSourceId: "rizom:asked",
  requiredPermission: "public",
  layout: { component: Asked },
});
