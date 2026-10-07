import type { JSX } from "react";
import { ASK_BOX_SCRIPT_PATH, ASK_SOURCES_EVENT } from "@brains/contracts";
import { AskBoxHost } from "@brains/site-atlas";
import type { AskBook } from "../datasources/book-ask-datasource";
import { bookClasses } from "./book-design";

export interface BookAskProps {
  name: string;
  askBox: boolean;
  books: AskBook[];
}

const PASSAGES_ATTRIBUTE = "data-book-passages";

/**
 * Fills the rail with the passages an answer drew on, each linked to its
 * page and named by its siglum, book and year; starts the question a reading
 * page asked for. Book entry ids are `<book>:<nnnnn>-<slug>`, with a part's
 * folder between in a book with parts (`<book>:<part>:<nnnnn>-<slug>`); the
 * entry's order is its last segment's number, and order 0 is the title page.
 */
const askScript = `(function () {
  var rail = document.querySelector("[${PASSAGES_ATTRIBUTE}]");
  if (!rail) return;
  var books = JSON.parse(rail.getAttribute("${PASSAGES_ATTRIBUTE}") || "{}");
  var list = rail.querySelector("ol");
  document.addEventListener("${ASK_SOURCES_EVENT}", function (event) {
    var sources = (event.detail && event.detail.sources) || [];
    list.textContent = "";
    sources.forEach(function (source) {
      var match = /^book:([^:]+):(?:[^:]+:)*0*(\\d+)-[^:]*$/.exec(source.id);
      if (!match) return;
      var book = books[match[1]] || { title: match[1], year: null };
      var link = document.createElement("a");
      link.href = match[2] === "0" ? "/books/" + match[1] : "/books/" + match[1] + "/" + match[2];
      [["sig", source.title], ["title", book.title], ["meta", (book.year ? book.year + " · " : "") + "read →"]].forEach(function (part) {
        var span = document.createElement("span");
        span.className = "book-ask__" + part[0];
        span.textContent = part[1];
        link.appendChild(span);
      });
      var item = document.createElement("li");
      item.appendChild(link);
      list.appendChild(item);
    });
    rail.hidden = list.children.length === 0;
  });
  var question = new URLSearchParams(window.location.search).get("q");
  var field = document.querySelector("[data-ask-box] textarea");
  if (question && field && !field.value) field.value = question;
})();`;

/** Asking the brain: the guest box, and the passages its answer cites. */
export const BookAskTemplate = ({
  name,
  askBox,
  books,
}: BookAskProps): JSX.Element => {
  const named = Object.fromEntries(
    books.map((book) => [book.book, { title: book.title, year: book.year }]),
  );
  return (
    <article className="mx-auto grid w-full max-w-[76rem] gap-x-14 gap-y-10 px-4 py-14 md:grid-cols-[minmax(0,1fr)_18rem] md:py-20">
      <div className="min-w-0">
        <p className={`${bookClasses.label} m-0 text-brand`}>
          Answers from the work
        </p>
        <h1 className="m-0 mt-4 font-heading text-6xl leading-[0.9] font-normal italic tracking-[-0.03em] text-heading md:text-8xl">
          Ask {name}
        </h1>
        {askBox ? (
          <div className="book-ask mt-10">
            <AskBoxHost
              prefix="book-ask"
              name={name}
              placeholder="Ask a question about the work …"
            />
            <script src={ASK_BOX_SCRIPT_PATH} defer />
          </div>
        ) : (
          <p className="mt-10 text-lg text-theme-muted">
            Asking {name} is not open yet.
          </p>
        )}
      </div>
      <aside className="md:pt-3">
        <div {...{ [PASSAGES_ATTRIBUTE]: JSON.stringify(named) }} hidden>
          <p className={`${bookClasses.label} m-0 mb-3`}>
            Passages in this answer
          </p>
          <ol className="book-ask__passages m-0 list-none p-0" />
        </div>
        <p className="m-0 mt-6 text-sm leading-relaxed text-theme-muted">
          {name} answers from the books and cites every passage. When the work
          has nothing on a question, {name} says so.
        </p>
      </aside>
      <script dangerouslySetInnerHTML={{ __html: askScript }} />
    </article>
  );
};
