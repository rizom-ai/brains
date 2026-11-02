/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SiteSectionDefinition,
} from "@rizom/site";

interface FirstStep extends JsonObject {
  /** A sentence saying what to do first. */
  text: string | null;
  /** Shell commands, one per line, shown as a terminal. */
  commands: string[];
  /** Steps in order, smallest first. */
  steps: string[];
  /** A closing line under the step. */
  note: string | null;
}

export interface DocsHomeDoorsContent extends JsonObject {
  heading: string;
  lede: string;
  firstStepLabel: string;
  /** Listed in the order of the docs sections, so each door sits above its
   *  section's guides and reference. */
  doors: Array<{ title: string; who: string; firstStep: FirstStep }>;
}

const docsHomeDoorsSchema: z.ZodType<DocsHomeDoorsContent> = z.object({
  heading: z.string(),
  lede: z.string(),
  firstStepLabel: z.string(),
  doors: z.array(
    z.object({
      title: z.string(),
      who: z.string(),
      firstStep: z.object({
        text: z.string().nullable().default(null),
        commands: z.array(z.string()).default([]),
        steps: z.array(z.string()).default([]),
        note: z.string().nullable().default(null),
      }),
    }),
  ),
});

/** Copy marks code with backticks: `brain.yaml`. */
function withCode(text: string): ReactNode[] {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? <code key={index}>{part}</code> : part,
    );
}

const FirstStepBody = ({ step }: { step: FirstStep }): JSX.Element => (
  <>
    {step.text && <p>{withCode(step.text)}</p>}
    {step.commands.length > 0 && (
      <pre>
        {step.commands.map((command, index) => (
          <span key={command}>
            {index > 0 && "\n"}
            <span className="dh-prompt">$ </span>
            {command}
          </span>
        ))}
      </pre>
    )}
    {step.steps.length > 0 && (
      <ol>
        {step.steps.map((item) => (
          <li key={item}>{withCode(item)}</li>
        ))}
      </ol>
    )}
    {step.note && <p className="dh-door__note">{withCode(step.note)}</p>}
  </>
);

/**
 * The doors' introductions: a brass root through a node on each door, its
 * name, who it is for and its first step. The guides and reference docs of
 * each door follow in the docs sections below, column for column.
 */
export const DocsHomeDoors = (content: DocsHomeDoorsContent): JSX.Element => (
  <section className="dh dh-doors" aria-labelledby="docs-home-doors">
    <div className="dh-wrap">
      <h2 className="dh-doors__heading" id="docs-home-doors">
        {content.heading}
      </h2>
      <p className="dh-doors__lede">{content.lede}</p>
      <div className="dh-doors__grid">
        {content.doors.map((door) => (
          <div className="dh-door" key={door.title}>
            <h3>{door.title}</h3>
            <p className="dh-door__who">{door.who}</p>
            <p className="dh-door__label">{content.firstStepLabel}</p>
            <FirstStepBody step={door.firstStep} />
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const docsHomeDoorsSection: SiteSectionDefinition = defineSection(
  docsHomeDoorsSchema,
  DocsHomeDoors,
  {
    title: "Docs home: the doors",
    description:
      "The doors into the docs: who each is for and its first step, above each section's guides and reference",
  },
);
