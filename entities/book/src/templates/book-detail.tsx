import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { BookWithData } from "../schemas/book";
import { bookClasses, bookHref, licenseLabel } from "./book-design";

export interface BookDetailProps {
  entry: BookWithData;
  book: BookWithData;
  prev: BookWithData | null;
  next: BookWithData | null;
  /** Sections in the book, not counting its title entry. */
  total: number;
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
  entry,
  book,
}: {
  entry: BookWithData;
  book: BookWithData;
}): JSX.Element => {
  const license = licenseLabel(book);
  return (
    <p
      className={`${bookClasses.rule} m-0 mt-12 pt-4 font-mono text-[13px] leading-relaxed text-theme-light`}
    >
      Source:{" "}
      <a href={entry.frontmatter.source} className={bookClasses.link}>
        {book.frontmatter.attribution ?? entry.frontmatter.source}
      </a>
      {license && <span> · {license}</span>}
    </p>
  );
};

/** Where a link leads: the section's own title, with its siglum. */
const PagerLabel = ({ target }: { target: BookWithData }): JSX.Element => (
  <>
    <span lang="de">{target.metadata.title}</span>
    {target.metadata.section && (
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
  prev: BookWithData | null;
  next: BookWithData | null;
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

const TitleView = ({
  entry,
  book,
  prev,
  next,
}: BookDetailProps): JSX.Element => (
  <article className={bookClasses.page}>
    <header className="mb-10">
      <p className={`${bookClasses.label} m-0`}>{book.frontmatter.author}</p>
      <h1
        className="m-0 mt-4 text-4xl leading-tight font-medium text-heading md:text-5xl"
        lang="de"
      >
        {entry.metadata.title}
      </h1>
      <BookDetails book={book} />
    </header>
    <div className="book-text" lang="de">
      <MarkdownContent markdown={entry.body} />
    </div>
    <Source entry={entry} book={book} />
    <Pager prev={prev} next={next} />
  </article>
);

/** A section set for reading: siglum and place in the margin, text alone. */
const SectionView = ({
  entry,
  book,
  prev,
  next,
  total,
}: BookDetailProps): JSX.Element => (
  <article className="mx-auto grid w-full max-w-[76rem] gap-x-14 gap-y-8 px-4 py-14 md:grid-cols-[13rem_minmax(0,40rem)] md:py-20">
    <aside className="md:pt-3">
      <p className="book-siglum m-0 text-3xl leading-none text-heading md:text-4xl">
        {entry.metadata.section ?? entry.metadata.order}
      </p>
      <p className="m-0 mt-4 font-mono text-xs leading-relaxed text-theme-muted">
        <a href={bookHref(book)} className={bookClasses.link} lang="de">
          {book.metadata.title}
        </a>
        <br />
        {book.frontmatter.year !== null && `${book.frontmatter.year} · `}
        section {entry.metadata.order} of {total}
      </p>
    </aside>
    <div className="min-w-0">
      <h1
        className="m-0 mb-8 text-5xl leading-none font-normal text-heading md:text-6xl"
        lang="de"
      >
        {entry.metadata.title}
      </h1>
      <div className="book-text" lang="de">
        <MarkdownContent markdown={entry.body} />
      </div>
      <Source entry={entry} book={book} />
      <Pager prev={prev} next={next} />
    </div>
  </article>
);

export const BookDetailTemplate = (props: BookDetailProps): JSX.Element =>
  props.entry.metadata.order === 0 ? (
    <TitleView {...props} />
  ) : (
    <SectionView {...props} />
  );
