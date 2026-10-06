import type { JSX } from "react";
import type { BookWithData } from "../schemas/book";
import { bookClasses, bookHref } from "./book-design";

export interface BookListProps {
  books: BookWithData[];
}

export const BookListTemplate = ({ books }: BookListProps): JSX.Element => (
  <section className={bookClasses.page}>
    <ol className="m-0 list-none p-0">
      {books.map((book) => (
        <li key={book.id} className={`${bookClasses.rule} py-6`}>
          <a href={bookHref(book)} className={bookClasses.link}>
            <h2 className="m-0 text-2xl font-medium text-heading">
              {book.metadata.title}
            </h2>
          </a>
          <p className={`${bookClasses.label} m-0 mt-2`}>
            {[book.frontmatter.author, book.frontmatter.year]
              .filter((part) => part !== null)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ol>
  </section>
);
