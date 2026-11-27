import type { JSX } from "react";
import { MarkdownContent } from "@rizom/brain-ui";
import type {
  SeminarDetailPage,
  SeminarPage,
  SeminarPageTurn,
} from "../datasources/seminar-datasource";
import {
  formatDay,
  linkedSources,
  nameList,
  peerHref,
  seminarClasses,
  seminarHref,
} from "./seminar-design";

export type SeminarDetailProps = SeminarDetailPage;

/** As many columns as a round has voices, three at most; one on a phone. */
const COLUMNS: Record<number, string> = {
  1: "md:grid-cols-[minmax(0,48rem)]",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};

function answers(names: readonly string[]): string {
  return names.length === 1 ? "answers" : "answer";
}

/** One peer's turn: his name, what he said with its sources linked, or that he did not answer. */
const Voice = ({
  turn,
  agent,
}: {
  turn: SeminarPageTurn;
  agent: string;
}): JSX.Element => (
  <article
    className={`min-w-0 border-b ${seminarClasses.softRule} py-6 md:border-b-0 md:border-r md:px-7 md:py-6 md:first:pl-0 md:last:border-r-0 md:last:pr-0`}
  >
    <h3 className="m-0 font-heading text-[1.65rem] font-medium leading-tight tracking-[-0.01em] text-heading">
      {turn.name}
    </h3>
    <a
      className="mt-1 block font-mono text-[0.6875rem] tracking-[0.04em] text-theme-light no-underline hover:text-[var(--color-accent)]"
      href={peerHref(agent)}
    >
      {agent}
    </a>
    {turn.text === null ? (
      <p className="mt-4 font-mono text-sm italic text-theme-light">
        {turn.name} did not answer.
      </p>
    ) : (
      <MarkdownContent
        markdown={linkedSources(turn.text, turn.sources)}
        className="seminar-voice mt-4"
      />
    )}
    {turn.sources.length > 0 && (
      <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
        {turn.sources.map((source) => (
          <li key={source.id}>
            {source.url === null ? (
              <span className="font-mono text-[0.75rem] text-theme-light">
                {source.title}
              </span>
            ) : (
              <a href={source.url} className={seminarClasses.cite}>
                {source.title}
              </a>
            )}
          </li>
        ))}
      </ul>
    )}
    {turn.to.length > 0 && (
      <p className="m-0 mt-3 font-mono text-[0.72rem] tracking-[0.03em] text-theme-light">
        → answers {nameList(turn.to)}
      </p>
    )}
  </article>
);

/** A round: its number, what happens in it, and its voices side by side. */
const Round = ({
  numeral,
  title,
  voices,
  agents,
}: {
  numeral: string;
  title: string;
  voices: SeminarPageTurn[];
  agents: ReadonlyMap<string, string>;
}): JSX.Element => (
  <section className={`${seminarClasses.frame} pt-11`}>
    <div className="mb-6 flex items-baseline gap-4">
      <span
        className={`min-w-[2.75rem] font-heading text-[2.5rem] italic leading-none ${seminarClasses.accent}`}
      >
        {numeral}
      </span>
      <h2 className="m-0 font-mono text-[0.8125rem] font-normal uppercase tracking-[0.06em] text-theme-muted">
        {title}
      </h2>
    </div>
    <div
      className={`grid grid-cols-1 ${seminarClasses.rule} ${COLUMNS[Math.min(voices.length, 3)] ?? ""}`}
    >
      {voices.map((turn) => (
        <Voice
          key={`${turn.round}:${turn.speaker}`}
          turn={turn}
          agent={agents.get(turn.name) ?? turn.speaker}
        />
      ))}
    </div>
  </section>
);

/** What the chair wrote, its markdown set as text; or that it could not. */
const ChairText = ({
  turn,
  className = "",
}: {
  turn: SeminarPageTurn;
  className?: string;
}): JSX.Element =>
  turn.text === null ? (
    <p className={`m-0 font-mono text-sm italic text-theme-light ${className}`}>
      {turn.failed}
    </p>
  ) : (
    <MarkdownContent
      markdown={turn.text}
      className={`seminar-voice ${className}`}
    />
  );

/** The chair between two rounds: what it read, and each follow-up as it put it. */
const Chair = ({ turns }: { turns: SeminarPageTurn[] }): JSX.Element | null => {
  if (turns.length === 0) return null;
  // What the chair says to all who answer comes first; then one follow-up each.
  const [first, ...rest] = turns;
  const reading = rest.length > 0 ? first : undefined;
  const followUps = reading ? rest : turns;
  return (
    <div className={`${seminarClasses.frame} pt-9`}>
      <aside className="border-l-[3px] border-[var(--color-accent)] bg-[var(--color-bg-deep)] px-5 py-6 md:px-8">
        <div
          className={`font-mono text-[0.75rem] uppercase tracking-[0.08em] ${seminarClasses.accent}`}
        >
          The chair
        </div>
        {reading && <ChairText turn={reading} className="mt-3 max-w-[58rem]" />}
        <ol className="m-0 mt-4 grid max-w-[58rem] list-none gap-3 p-0">
          {followUps.map((turn, index) => (
            <li
              key={index}
              className="grid gap-x-5 gap-y-1 text-[0.97rem] leading-relaxed md:grid-cols-[6.5rem_minmax(0,1fr)]"
            >
              <b className="pt-[0.15rem] font-mono text-[0.75rem] font-bold uppercase tracking-[0.04em]">
                {turn.to.length > 0 ? `To ${nameList(turn.to)}` : ""}
              </b>
              <ChairText turn={turn} />
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
};

const Neighbor = ({
  seminar,
  label,
}: {
  seminar: SeminarPage | null;
  label: string;
}): JSX.Element =>
  seminar === null ? (
    <div />
  ) : (
    <a className="group block no-underline" href={seminarHref(seminar)}>
      <span className={seminarClasses.label}>{label}</span>
      <span className="mt-1 block font-heading text-2xl leading-tight text-heading group-hover:text-[var(--color-accent)]">
        {seminar.question}
      </span>
    </a>
  );

/**
 * One seminar, read top to bottom: the question, the openings side by side,
 * the chair's turn, the challenges, the rejoinder, and where they meet.
 */
export const SeminarDetailTemplate = ({
  seminar,
  prevSeminar,
  nextSeminar,
}: SeminarDetailProps): JSX.Element => {
  const agents = new Map(
    seminar.speakers.map(({ agent, name }) => [name, agent]),
  );
  const round = (
    name: SeminarPageTurn["round"],
    chair: boolean,
  ): SeminarPageTurn[] =>
    seminar.turns.filter((turn) => turn.round === name && turn.chair === chair);
  const challenges = round("challenge", false);
  const rejoinders = round("rejoinder", false);
  const challengers = challenges.map(({ name }) => name);

  return (
    <article className="seminar-page" lang="en">
      <header
        className={`${seminarClasses.frame} border-b border-[var(--color-rule-strong)] pb-10 pt-14 md:pt-16`}
      >
        <div className={seminarClasses.label}>
          Seminar · {formatDay(seminar.asked)}
        </div>
        <h1 className="m-0 mt-4 max-w-[62rem] font-heading text-[clamp(2.1rem,5vw,4rem)] font-normal leading-[1.02] tracking-[-0.02em] text-heading">
          {seminar.question}
        </h1>
        <ul className="m-0 mt-7 flex list-none flex-wrap gap-x-7 gap-y-2 p-0 font-mono text-[0.78rem]">
          {seminar.speakers.map(({ agent, name }) => (
            <li key={agent}>
              <a className={seminarClasses.quiet} href={peerHref(agent)}>
                {name} · {agent}
              </a>
            </li>
          ))}
        </ul>
      </header>

      <Round
        numeral="I"
        title="Openings — the question, put to all at once"
        voices={round("opening", false)}
        agents={agents}
      />

      <Chair turns={round("challenge", true)} />
      {challenges.length > 0 && seminar.stands !== null && (
        <Round
          numeral="II"
          title={`${nameList(challengers)} ${answers(challengers)} ${seminar.stands}`}
          voices={challenges}
          agents={agents}
        />
      )}

      <Chair turns={round("rejoinder", true)} />
      {rejoinders.length > 0 && seminar.stands !== null && (
        <Round
          numeral="III"
          title={`${seminar.stands} answers ${nameList(rejoinders[0]?.to ?? [])}`}
          voices={rejoinders}
          agents={agents}
        />
      )}

      {seminar.closing !== null && (
        <section
          className={`${seminarClasses.frame} mt-10 border-t border-[var(--color-rule-strong)] pb-14 pt-12`}
        >
          <h2 className="m-0 font-heading text-[2.1rem] font-normal italic text-heading">
            Where they meet
          </h2>
          <MarkdownContent
            markdown={seminar.closing.text}
            className="seminar-voice seminar-meet mt-4 max-w-[54rem]"
          />
          {seminar.closing.sources.length > 0 && (
            <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
              {seminar.closing.sources.map((source) => (
                <li key={source.id}>
                  {source.url === null ? (
                    <span className="font-mono text-[0.75rem] text-theme-light">
                      {source.title}
                    </span>
                  ) : (
                    <a href={source.url} className={seminarClasses.cite}>
                      {source.title}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-4 font-mono text-[0.72rem] text-theme-light">
            Written by the chair from the answers above. It cites nothing they
            did not.
          </p>
        </section>
      )}

      {(prevSeminar !== null || nextSeminar !== null) && (
        <nav
          aria-label="Other seminars"
          className={`${seminarClasses.frame} grid gap-8 border-t border-[var(--color-rule-strong)] py-10 md:grid-cols-2`}
        >
          <Neighbor seminar={prevSeminar} label="Held after" />
          <Neighbor seminar={nextSeminar} label="Held before" />
        </nav>
      )}
    </article>
  );
};
