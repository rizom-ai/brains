import type { JSX } from "react";
import { MarkdownContent } from "@brains/ui-library";
import type { BookWithData } from "../schemas/book";
import { bookClasses, bookHref, licenseLabel } from "./book-design";

export interface BookDetailProps {
  entry: BookWithData;
  book: BookWithData;
  prev: BookWithData | null;
  next: BookWithData | null;
}

const BookDetails = ({ book }: { book: BookWithData }): JSX.Element => (
  <dl className="m-0 mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-theme-muted">
    {book.frontmatter.author && (
      <>
        <dt className={bookClasses.label}>Autor</dt>
        <dd className="m-0">{book.frontmatter.author}</dd>
      </>
    )}
    {book.frontmatter.year !== null && (
      <>
        <dt className={bookClasses.label}>Jahr</dt>
        <dd className="m-0">{book.frontmatter.year}</dd>
      </>
    )}
    {book.frontmatter.edition && (
      <>
        <dt className={bookClasses.label}>Ausgabe</dt>
        <dd className="m-0">{book.frontmatter.edition}</dd>
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
    <p className="m-0 mt-12 text-[13px] text-theme-muted">
      <a href={entry.frontmatter.source} className={bookClasses.link}>
        {book.frontmatter.attribution ?? entry.frontmatter.source}
      </a>
      {license && <span> · {license}</span>}
    </p>
  );
};

const Pager = ({
  prev,
  next,
}: {
  prev: BookWithData | null;
  next: BookWithData | null;
}): JSX.Element => (
  <nav
    className={`${bookClasses.rule} mt-16 flex justify-between gap-6 pt-6 text-sm`}
  >
    {prev ? (
      <a href={bookHref(prev)} rel="prev" className={bookClasses.link}>
        ← {prev.metadata.section ?? prev.metadata.title}
      </a>
    ) : (
      <span />
    )}
    {next && (
      <a href={bookHref(next)} rel="next" className={bookClasses.link}>
        {next.metadata.section ?? next.metadata.title} →
      </a>
    )}
  </nav>
);

export const BookDetailTemplate = ({
  entry,
  book,
  prev,
  next,
}: BookDetailProps): JSX.Element => {
  const isTitle = entry.metadata.order === 0;
  return (
    <article className={bookClasses.page}>
      <header className="mb-10">
        {isTitle ? (
          <p className={`${bookClasses.label} m-0`}>
            {book.frontmatter.author}
          </p>
        ) : (
          <p className={`${bookClasses.label} m-0`}>
            <a href={bookHref(book)} className={bookClasses.link}>
              {book.metadata.title}
            </a>
            {entry.metadata.section && <span> · {entry.metadata.section}</span>}
          </p>
        )}
        <h1 className="m-0 mt-4 text-4xl leading-tight font-medium text-heading md:text-5xl">
          {entry.metadata.title}
        </h1>
        {isTitle && <BookDetails book={book} />}
      </header>

      <MarkdownContent markdown={entry.body} />

      <Source entry={entry} book={book} />
      <Pager prev={prev} next={next} />
    </article>
  );
};
