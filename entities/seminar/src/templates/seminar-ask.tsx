import type { JSX } from "react";
import { ASK_BOX_SCRIPT_PATH } from "@brains/contracts";
import { AskBoxHost } from "@brains/site-atlas";
import type { SeminarAskPage } from "../datasources/seminar-ask-datasource";
import { nameList, seminarClasses } from "./seminar-design";

export type SeminarAskProps = SeminarAskPage;

/**
 * Asking the brain: the guest box while asking is open, and a word on whom
 * a question reaches. The box takes the reading theme's frame, which names
 * its classes after the page it was drawn for.
 */
export const SeminarAskTemplate = ({
  name,
  askBox,
  peers,
}: SeminarAskProps): JSX.Element => (
  <article
    className={`${seminarClasses.frame} grid gap-x-14 gap-y-10 py-14 md:grid-cols-[minmax(0,1fr)_18rem] md:py-20`}
  >
    <div className="min-w-0">
      <p className={`m-0 ${seminarClasses.label} ${seminarClasses.accent}`}>
        One question, put to all at once
      </p>
      <h1 className="m-0 mt-4 font-heading text-6xl font-normal italic leading-[0.9] tracking-[-0.03em] text-heading md:text-8xl">
        Ask {name}
      </h1>
      {askBox ? (
        <div className="book-ask mt-10">
          <AskBoxHost
            prefix="book-ask"
            name={name}
            placeholder="Ask a question …"
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
      <p className="m-0 mt-6 text-sm leading-relaxed text-theme-muted">
        {peers.length > 0
          ? `A question goes to ${nameList(peers)} at once. Each answers from his own books and cites every passage; ${name} sets their answers side by side and says where they meet.`
          : `${name} puts a question to its peers at once and sets their answers side by side.`}{" "}
        An answer here is not kept as a seminar.
      </p>
    </aside>
  </article>
);
