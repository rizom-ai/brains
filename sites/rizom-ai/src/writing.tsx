/** @jsxImportSource react */
import type { JSX } from "react";
import { createTemplate, type Template } from "@brains/templates";
import { z } from "@rizom/site";

/**
 * The /writing archive: the essays and the presentations on one thread,
 * newest first, essays as lanterns with their excerpt and presentations as
 * plain nodes, with a filter that needs no script. The data comes from the
 * blog and decks datasources through the site's own (see
 * ./writing-datasource). Each post and deck keeps the entity fields the site
 * builder links it by (id, entityType, content and metadata.slug), and gets
 * its url from that pass.
 */

const linked = {
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  /** Added by the site builder once the entity is linked. */
  url: z.string().nullable().default(null),
};
const postSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodString;
  content: z.ZodString;
  created: z.ZodString;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  metadata: z.ZodObject<{
    title: z.ZodString;
    slug: z.ZodString;
    publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  }>;
  frontmatter: z.ZodDefault<
    z.ZodObject<{ excerpt: z.ZodDefault<z.ZodString> }>
  >;
}> = z.object({
  ...linked,
  metadata: z.object({
    title: z.string(),
    slug: z.string(),
    publishedAt: z.string().nullable().default(null),
  }),
  frontmatter: z
    .object({ excerpt: z.string().default("") })
    .default({ excerpt: "" }),
});
const deckSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodString;
  content: z.ZodString;
  created: z.ZodString;
  url: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  metadata: z.ZodObject<{ slug: z.ZodString }>;
  frontmatter: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    publishedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  }>;
}> = z.object({
  ...linked,
  metadata: z.object({ slug: z.string() }),
  frontmatter: z.object({
    title: z.string(),
    description: z.string().nullable().default(null),
    publishedAt: z.string().nullable().default(null),
  }),
});
export const writingSchema: z.ZodObject<{
  posts: z.ZodDefault<z.ZodArray<typeof postSchema>>;
  decks: z.ZodDefault<z.ZodArray<typeof deckSchema>>;
}> = z.object({
  posts: z.array(postSchema).default([]),
  decks: z.array(deckSchema).default([]),
});
export type WritingData = z.output<typeof writingSchema>;

type Kind = "essay" | "deck";
interface Piece {
  kind: Kind;
  id: string;
  url: string | null;
  title: string;
  date: string;
  text: string;
}

const LABEL: Record<Kind, string> = { essay: "Essay", deck: "Presentation" };
const FILTERS = [
  { value: "all", label: "Everything" },
  { value: "essay", label: "Essays" },
  { value: "deck", label: "Presentations" },
];
const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function pieces({ posts, decks }: WritingData): Piece[] {
  return [
    ...posts.map((post): Piece => ({
      kind: "essay",
      id: post.id,
      url: post.url,
      title: post.metadata.title,
      date: post.metadata.publishedAt ?? post.created,
      text: post.frontmatter.excerpt,
    })),
    ...decks.map((deck): Piece => ({
      kind: "deck",
      id: deck.id,
      url: deck.url,
      title: deck.frontmatter.title,
      date: deck.frontmatter.publishedAt ?? deck.created,
      text: deck.frontmatter.description ?? "",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function PieceBody({ piece }: { piece: Piece }): JSX.Element {
  return (
    <>
      <small>
        {LABEL[piece.kind]} · {day.format(new Date(piece.date))}
      </small>
      <b>{piece.title}</b>
      {piece.text && <span>{piece.text}</span>}
    </>
  );
}

export function WritingArchive(data: WritingData): JSX.Element {
  const thread = pieces(data);
  return (
    <section id="writing" className="archive">
      <link rel="stylesheet" href="/styles/writing.css" precedence="page" />
      <header className="archive__head">
        <p className="eyebrow">Writing</p>
        <h1>Essays and presentations.</h1>
        <p className="lede">
          A working bibliography; new entries land roughly monthly.
        </p>
        <fieldset className="archive__filter">
          <legend>Show</legend>
          {FILTERS.map((filter) => (
            <label key={filter.value}>
              <input
                type="radio"
                name="show"
                value={filter.value}
                defaultChecked={filter.value === "all"}
              />
              {filter.label}
            </label>
          ))}
        </fieldset>
      </header>
      {thread.length === 0 ? (
        <p className="archive__empty">Nothing published yet.</p>
      ) : (
        <ol className="thread-list">
          {thread.map((piece, i) => (
            <li
              key={`${piece.kind}-${piece.id}`}
              className={`piece piece--${piece.kind}`}
              style={{
                animationDelay: `${Math.round((0.4 + Math.min(i, 8) * 0.15) * 100) / 100}s`,
              }}
            >
              <span className="piece__mark" aria-hidden="true" />
              {piece.url ? (
                <a href={piece.url}>
                  <PieceBody piece={piece} />
                </a>
              ) : (
                <div>
                  <PieceBody piece={piece} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export const writingTemplate: Template = createTemplate({
  name: "writing",
  description:
    "The archive: essays and presentations on one thread, newest first",
  schema: writingSchema,
  dataSourceId: "rizom:writing",
  requiredPermission: "public",
  layout: { component: WritingArchive },
});
