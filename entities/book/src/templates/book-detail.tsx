import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { BookWithData } from "../schemas/book";
import type { BookSectionWithData } from "../schemas/book-section";
import type { ScoreEntry, Theme } from "../datasources/book-datasource";
import { count } from "../lib/count";
import { bookClasses, bookHref, licenseLabel } from "./book-design";

/** A book's title page. */
export interface BookDetailProps {
  book: BookWithData;
  /** The section reading begins at; null for a book without sections. */
  first: BookSectionWithData | null;
  /** Every section in reading order. */
  score: ScoreEntry[];
}

/** A section set for reading. */
export interface BookSectionProps {
  section: BookSectionWithData;
  book: BookWithData;
  prev: BookSectionWithData | null;
  next: BookSectionWithData | null;
  /** Sections in the book. */
  total: number;
  /** The topics nearest the section. */
  themes: Theme[];
}

const BookDetails = ({ book }: { book: BookWithData }): JSX.Element => (
  <dl className="m-0 mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-theme-muted">
    {book.frontmatter.author && (
      <>
        <dt className={bookClasses.label}>Author</dt>
        <dd className="m-0">{book.frontmatter.author}</dd>
      </>
    )}
    {book.frontmatter.year !== null && (
      <>
        <dt className={bookClasses.label}>Year</dt>
        <dd className="m-0">{book.frontmatter.year}</dd>
      </>
    )}
    {book.frontmatter.edition && (
      <>
        <dt className={bookClasses.label}>Edition</dt>
        <dd className="m-0" lang="de">
          {book.frontmatter.edition}
        </dd>
      </>
    )}
  </dl>
);

const Source = ({
  href,
  book,
}: {
  /** The edition's page for what is shown: the book, or one section. */
  href: string;
  book: BookWithData;
}): JSX.Element => {
  const license = licenseLabel(book);
  return (
    <p
      className={`${bookClasses.rule} m-0 mt-12 pt-4 font-mono text-[13px] leading-relaxed text-theme-light`}
    >
      Source:{" "}
      <a href={href} className={bookClasses.link}>
        {book.frontmatter.attribution ?? href}
      </a>
      {license && <span> · {license}</span>}
    </p>
  );
};

/** Where a link leads: the section's own title, with its siglum. */
const PagerLabel = ({
  target,
}: {
  target: BookSectionWithData;
}): JSX.Element => (
  <>
    <span lang="de">{target.metadata.title}</span>
    {target.metadata.section &&
      target.metadata.section !== target.metadata.title && (
        <span className="book-siglum ml-2 text-theme-light">
          {target.metadata.section}
        </span>
      )}
  </>
);

const Pager = ({
  prev,
  next,
}: {
  prev: BookSectionWithData | null;
  next: BookSectionWithData | null;
}): JSX.Element => (
  <nav
    className="mt-10 flex justify-between gap-6 font-mono text-sm"
    aria-label="Sections"
  >
    {prev ? (
      <a href={bookHref(prev)} rel="prev" className={bookClasses.link}>
        ← <PagerLabel target={prev} />
      </a>
    ) : (
      <span />
    )}
    {next && (
      <a href={bookHref(next)} rel="next" className={bookClasses.link}>
        <PagerLabel target={next} /> →
      </a>
    )}
  </nav>
);

/** The tallest stroke in a book's score; every other is to scale. */
const TALLEST_STROKE = 46;

/**
 * One line of the score: a heading of the book, a unit its author titled, or
 * a run of untitled sections. A line draws a stroke for each of its sections.
 */
interface ScoreLineData {
  kind: "heading" | "unit" | "run";
  label: string;
  /** How many headings the line stands under. */
  depth: number;
  first: ScoreEntry;
  sections: ScoreEntry[];
}

/** A number, as aphorisms and paragraphs are titled: 125, 65a, II. */
const NUMBERED = /^[0-9IVXLC]+[a-z]?\.?$/;

/** The edition's own name for a unit is in brackets: [Motto], Za-II-[Titel]. */
function isEditorial(text: string | null): boolean {
  return text?.includes("[") ?? false;
}

/**
 * A unit's name without the edition's brackets or siglum, its number set
 * apart: Za-II-[Motto] → Motto, [Einleitung2] → Einleitung 2.
 */
function plainName(entry: ScoreEntry): string {
  return entry.title
    .replace(/^.*\[/, "")
    .replace(/\]$/, "")
    .replace(/(\p{L})(\d+)$/u, "$1 $2");
}

/**
 * Whether a unit is an entry of the contents: a title its author gave it, or
 * a text the edition names (a motto, a dedication). Numbered units and title
 * pages are drawn, not listed.
 */
function isEntry(entry: ScoreEntry): boolean {
  if (!isEditorial(entry.title) && !isEditorial(entry.section)) {
    return !NUMBERED.test(entry.title);
  }
  const name = plainName(entry);
  return name !== "Titel" && !NUMBERED.test(name);
}

/** A title page: the edition's [Titel] block before a book or a part. */
function isTitlePage(entry: ScoreEntry): boolean {
  return isEditorial(entry.section) && plainName(entry) === "Titel";
}

/** A run is named by its first and last unit, title pages aside. */
function runLabel(sections: ScoreEntry[]): string {
  const named = sections.filter((section) => !isTitlePage(section));
  const first = named[0] ?? sections[0];
  const last = named.at(-1) ?? first;
  if (!first || !last) return "";
  const from = plainName(first);
  const to = plainName(last);
  return from === to ? from : `${from}–${to}`;
}

function samePath(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((heading, depth) => heading === right[depth])
  );
}

/**
 * The book's contents as it is printed: every heading, every unit its author
 * titled, and, as strokes, the numbered and editorial units between them.
 * Untitled units directly under a heading draw on the heading's line.
 */
function linesOf(score: ScoreEntry[]): ScoreLineData[] {
  const outline = score.reduce<{
    lines: ScoreLineData[];
    /** A book's own title page, waiting for the line it opens. */
    pending: ScoreEntry[];
  }>(
    ({ lines, pending }, entry, index) => {
      const previous = score[index - 1]?.headings ?? [];
      const opened = entry.headings.findIndex(
        (heading, depth) => heading !== previous[depth],
      );
      const headings =
        opened === -1
          ? []
          : entry.headings
              .slice(opened)
              .map((label, offset): ScoreLineData => ({
                kind: "heading",
                label,
                depth: opened + offset,
                first: entry,
                sections: [],
              }));
      const all = [...lines, ...headings];
      const last = all.at(-1);
      const depth = entry.headings.length;
      const titled = isEntry(entry);
      const joins =
        last !== undefined &&
        (titled
          ? last.kind === "unit" &&
            plainName(last.first) === plainName(entry) &&
            samePath(last.first.headings, entry.headings)
          : (last.kind === "heading" &&
              last.depth === depth - 1 &&
              samePath(last.first.headings.slice(0, depth), entry.headings)) ||
            (last.kind === "run" &&
              samePath(last.first.headings, entry.headings)));
      if (joins) {
        last.sections.push(...pending, entry);
        if (last.kind === "run") last.label = runLabel(last.sections);
        return { lines: all, pending: [] };
      }
      if (isTitlePage(entry))
        return { lines: all, pending: [...pending, entry] };
      const sections = [...pending, entry];
      return {
        lines: [
          ...all,
          {
            kind: titled ? "unit" : "run",
            label: titled ? plainName(entry) : runLabel(sections),
            depth,
            first: entry,
            sections,
          },
        ],
        pending: [],
      };
    },
    { lines: [], pending: [] },
  );
  // A book of its title page alone still draws it.
  const [titlePage] = outline.pending;
  return titlePage
    ? [
        ...outline.lines,
        {
          kind: "run",
          label: plainName(titlePage),
          depth: 0,
          first: titlePage,
          sections: outline.pending,
        },
      ]
    : outline.lines;
}

const INDENT = ["", "md:pl-4", "md:pl-8", "md:pl-12"];

/** One line of the score: its label, a stroke per section, the count. */
const ScoreLine = ({
  line,
  longest,
}: {
  line: ScoreLineData;
  longest: number;
}): JSX.Element => {
  const part = line.kind === "heading" && line.depth === 0;
  const size = part
    ? "text-xl"
    : line.kind === "heading"
      ? "text-lg"
      : "text-base";
  return (
    <div
      className={`${part ? `${bookClasses.rule} pt-5` : ""} grid gap-x-6 gap-y-2 py-2 md:grid-cols-[13rem_1fr_3rem] md:items-end`}
    >
      <a
        href={`/books/${line.first.slug}`}
        className={`${bookClasses.link} font-heading italic ${size} ${INDENT[Math.min(line.depth, INDENT.length - 1)] ?? ""}`}
        lang="de"
      >
        {line.label}
      </a>
      <div className="flex flex-wrap items-end gap-x-[1px] gap-y-2">
        {line.sections.map((section) => (
          <a
            key={section.slug}
            href={`/books/${section.slug}`}
            title={[section.section, section.title].filter(Boolean).join(" · ")}
            style={{
              height: `${Math.max(4, Math.round((section.length / longest) * TALLEST_STROKE))}px`,
            }}
            className="block w-[2px] bg-[var(--color-heading)] opacity-85 hover:bg-brand hover:opacity-100"
          />
        ))}
      </div>
      <span className="font-mono text-xs text-theme-light md:text-right">
        {line.sections.length > 0 ? line.sections.length : ""}
      </span>
    </div>
  );
};

/** The score: the book's contents, each line with a stroke per section. */
const Score = ({ score }: { score: ScoreEntry[] }): JSX.Element => {
  const longest = Math.max(1, ...score.map((section) => section.length));
  return (
    <div>
      <p className={`${bookClasses.label} m-0 mb-6`}>
        Score — one stroke per section, as tall as its text
      </p>
      {linesOf(score).map((line) => (
        <ScoreLine
          key={`${line.kind}:${line.depth}:${line.first.slug}`}
          line={line}
          longest={longest}
        />
      ))}
    </div>
  );
};

/**
 * A book's title sets large in its narrow column; a title with a long word
 * (`Allzumenschliches`) steps down a size so the word fits whole, and only
 * hyphenates beyond that.
 */
function titleSize(title: string): string {
  const longest = Math.max(...title.split(/\s+/).map((word) => word.length));
  if (longest > 14) return "text-4xl md:text-4xl";
  if (longest > 10) return "text-4xl md:text-5xl";
  return "text-5xl md:text-6xl";
}

/** A book's title page: its details beside the score of its sections. */
export const BookDetailTemplate = ({
  book,
  first,
  score,
}: BookDetailProps): JSX.Element => (
  <article className="mx-auto grid w-full max-w-[76rem] gap-x-16 gap-y-12 px-4 py-14 md:grid-cols-[22rem_minmax(0,1fr)] md:py-20">
    <header>
      <p className={`${bookClasses.label} m-0`}>{book.frontmatter.author}</p>
      <h1
        className={`m-0 mt-5 font-heading leading-[0.95] font-normal tracking-[-0.02em] text-heading hyphens-auto ${titleSize(book.metadata.title)}`}
        lang="de"
      >
        {book.metadata.title}
      </h1>
      <BookDetails book={book} />
      <p className="m-0 mt-2 font-mono text-sm text-theme-muted">
        {count(score.length, "section")}
      </p>
      <Source href={book.frontmatter.source} book={book} />
      {first && (
        <nav className="mt-10 flex justify-end font-mono text-sm">
          <a href={bookHref(first)} rel="next" className={bookClasses.link}>
            Begin reading →
          </a>
        </nav>
      )}
    </header>
    <Score score={score} />
  </article>
);

/**
 * Asking the brain about a section names it by its title; the question starts
 * with its siglum, so the answer cites the right passage.
 */
const AskAbout = ({
  siglum,
  title,
}: {
  siglum: string;
  title: string;
}): JSX.Element => (
  <a
    href={`/ask?q=${encodeURIComponent(`About ${siglum}: `)}`}
    className={`${bookClasses.link} block border-t-[1.5px] border-[var(--color-heading)] pt-3 font-heading text-lg italic text-theme-muted`}
    lang="de"
  >
    Ask about {title} →
  </a>
);

/**
 * What a reader asks about: the section's title, but for an editorial unit
 * (a bracketed siglum, `Za-II-[Titel]`) whose title only names its kind,
 * the heading it opens, or the book.
 */
function askTitleOf(section: BookSectionWithData, book: BookWithData): string {
  if (!section.metadata.section?.includes("[")) return section.metadata.title;
  return section.frontmatter.headings.at(-1) ?? book.metadata.title;
}

/** The longest stretch of a siglum the margin sets on one line at full size. */
const MARGIN_SEGMENT = 9;

/**
 * A siglum breaks at its hyphens; one whose longest segment would overrun the
 * margin is set a size smaller, and only breaks inside a segment beyond that.
 */
const Siglum = ({ siglum }: { siglum: string }): JSX.Element => {
  const longest = Math.max(...siglum.split("-").map((part) => part.length));
  const size =
    longest > MARGIN_SEGMENT ? "text-2xl md:text-2xl" : "text-3xl md:text-4xl";
  return (
    <p
      className={`book-siglum m-0 leading-none text-heading [overflow-wrap:anywhere] ${size}`}
    >
      {siglum}
    </p>
  );
};

/** A section set for reading: siglum and place in the margin, text alone. */
export const BookSectionTemplate = ({
  section,
  book,
  prev,
  next,
  total,
  themes,
}: BookSectionProps): JSX.Element => (
  <article className="mx-auto grid w-full max-w-[76rem] gap-x-14 gap-y-8 px-4 py-14 md:grid-cols-[13rem_minmax(0,40rem)] md:py-20 lg:grid-cols-[13rem_minmax(0,40rem)_minmax(0,14rem)]">
    <aside className="md:pt-3">
      <Siglum
        siglum={section.metadata.section ?? String(section.metadata.order)}
      />
      <p className="m-0 mt-4 font-mono text-xs leading-relaxed text-theme-muted">
        <a href={bookHref(book)} className={bookClasses.link} lang="de">
          {book.metadata.title}
        </a>
        {section.frontmatter.headings.length > 0 && (
          <>
            <br />
            <span lang="de">{section.frontmatter.headings.join(" · ")}</span>
          </>
        )}
        <br />
        {book.frontmatter.year !== null && `${book.frontmatter.year} · `}
        section {section.metadata.order} of {total}
      </p>
    </aside>
    <div className="min-w-0">
      <h1
        className="m-0 mb-8 text-5xl leading-none font-normal text-heading hyphens-auto md:text-6xl"
        lang="de"
      >
        {section.metadata.title}
      </h1>
      <div className="book-text" lang="de">
        <MarkdownContent markdown={section.body} />
      </div>
      <Source href={section.frontmatter.source} book={book} />
      <Pager prev={prev} next={next} />
    </div>
    <aside className="md:col-start-2 lg:col-start-3 lg:pt-3">
      {themes.length > 0 && (
        <>
          <p className={`${bookClasses.label} m-0 mb-3`}>
            Themes in this section
          </p>
          <ul className="m-0 mb-8 list-none p-0">
            {themes.map((theme) => (
              <li key={theme.id} className={`${bookClasses.rule} py-2`}>
                <a
                  href={`/topics/${theme.id}`}
                  className={`${bookClasses.link} font-heading text-xl italic`}
                >
                  {theme.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <AskAbout
        siglum={section.metadata.pageTitle}
        title={askTitleOf(section, book)}
      />
    </aside>
  </article>
);
