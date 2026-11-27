import type { JSX } from "react";
import type {
  SeminarListPage,
  SeminarPage,
} from "../datasources/seminar-datasource";
import {
  firstSentence,
  formatDay,
  nameList,
  peerHref,
  roman,
  seminarClasses,
  seminarHref,
} from "./seminar-design";

export type SeminarListProps = SeminarListPage;

/** Who answered the one who stood, and who gave no opening. */
function parts(seminar: SeminarPage): {
  challengers: string[];
  silent: string[];
} {
  const peerTurns = seminar.turns.filter((turn) => !turn.chair);
  return {
    challengers: peerTurns
      .filter(({ round }) => round === "challenge")
      .map(({ name }) => name),
    silent: peerTurns
      .filter(({ round, text }) => round === "opening" && text === null)
      .map(({ name }) => name),
  };
}

const Entry = ({
  seminar,
  numeral,
}: {
  seminar: SeminarPage;
  numeral: string;
}): JSX.Element => {
  const { challengers, silent } = parts(seminar);
  return (
    <a
      className="group grid gap-x-8 gap-y-3 border-b border-[var(--color-rule-strong)] py-9 no-underline last:border-b-0 md:grid-cols-[6rem_minmax(0,1fr)_16rem] md:py-11"
      href={seminarHref(seminar)}
    >
      <span
        className={`font-heading text-[2.75rem] italic leading-[0.9] md:text-[4rem] ${seminarClasses.accent}`}
      >
        {numeral}
      </span>
      <span className="block min-w-0">
        <span className="block font-heading text-[clamp(1.9rem,3.9vw,3.4rem)] font-normal leading-[1.04] tracking-[-0.02em] text-heading transition-colors group-hover:text-[var(--color-accent)]">
          {seminar.question}
        </span>
        {seminar.closing !== null && (
          <span className="mt-4 block max-w-[40rem] text-[1.06rem] leading-relaxed text-theme-muted">
            <span className="font-mono text-[0.72rem] uppercase tracking-[0.06em] text-theme-light">
              Where they meet —{" "}
            </span>
            {firstSentence(seminar.closing.text)}
          </span>
        )}
      </span>
      <span className="block font-mono text-[0.78rem] leading-[1.75] text-theme-muted md:pt-2">
        <span className="block uppercase tracking-[0.04em] text-theme-light">
          {formatDay(seminar.asked)}
        </span>
        {seminar.stands !== null && (
          <span className={`block ${seminarClasses.accent}`}>
            {seminar.stands} stands
          </span>
        )}
        {seminar.stands !== null && challengers.length > 0 && (
          <span className="block">
            {nameList(challengers)}{" "}
            {challengers.length === 1 ? "answers" : "answer"} him
          </span>
        )}
        {silent.length > 0 && (
          <span className="block italic text-theme-light">
            {nameList(silent)} {silent.length === 1 ? "was" : "were"} silent
          </span>
        )}
      </span>
    </a>
  );
};

/**
 * The seminars, in the order given (newest first), numbered in the order
 * they were held, under a word on how a seminar goes.
 */
export const SeminarListTemplate = ({
  seminars,
}: SeminarListProps): JSX.Element => {
  // The peers of the newest seminar are the peers the brain holds them with.
  const peers = seminars[0]?.speakers ?? [];
  return (
    <div className="seminar-list" lang="en">
      {peers.length > 0 && (
        <section
          className={`${seminarClasses.frame} border-b border-[var(--color-rule-strong)] pb-10`}
        >
          <p className="m-0 max-w-[30rem] text-[1.06rem] leading-relaxed text-theme-muted md:ml-auto">
            Each seminar puts one question to{" "}
            <b className="font-semibold text-heading">
              {nameList(peers.map(({ name }) => name))}
            </b>{" "}
            at once. One of them stands; the others answer him from their own
            books; he answers them. Every word of theirs is their own brain
            quoting its own texts.
          </p>
          <ul className="m-0 mt-5 flex max-w-[30rem] list-none flex-wrap gap-x-6 gap-y-2 p-0 font-mono text-[0.78rem] md:ml-auto">
            {peers.map(({ agent }) => (
              <li key={agent}>
                <a className={seminarClasses.quiet} href={peerHref(agent)}>
                  {agent}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={seminarClasses.frame}>
        <h2 className={`m-0 pt-7 font-normal ${seminarClasses.label}`}>
          Seminars held
        </h2>
        {seminars.length === 0 ? (
          <p className="m-0 py-12 font-mono text-sm text-theme-light">
            No seminar has been held yet.
          </p>
        ) : (
          seminars.map((seminar, index) => (
            <Entry
              key={seminar.id}
              seminar={seminar}
              numeral={roman(seminars.length - index)}
            />
          ))
        )}
      </section>
    </div>
  );
};
