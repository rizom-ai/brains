/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import { defineSection, z, type SiteSectionDefinition } from "@rizom/site";

const docsHomeDoorsSchema: z.ZodObject<{
  heading: z.ZodString;
  lede: z.ZodString;
  firstStepLabel: z.ZodString;
  doors: z.ZodArray<
    z.ZodObject<{
      title: z.ZodString;
      who: z.ZodString;
      firstStep: z.ZodObject<{
        text: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        commands: z.ZodDefault<z.ZodArray<z.ZodString>>;
        steps: z.ZodDefault<z.ZodArray<z.ZodString>>;
        note: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      }>;
    }>
  >;
}> = z.object({
  heading: z.string(),
  lede: z.string(),
  firstStepLabel: z.string(),
  /** Listed in the order of the docs sections, so each door sits above its
   *  section's guides and reference. */
  doors: z.array(
    z.object({
      title: z.string(),
      who: z.string(),
      firstStep: z.object({
        /** A sentence saying what to do first. */
        text: z.string().nullable().default(null),
        /** Shell commands, one per line, shown as a terminal. */
        commands: z.array(z.string()).default([]),
        /** Steps in order, smallest first. */
        steps: z.array(z.string()).default([]),
        /** A closing line under the step. */
        note: z.string().nullable().default(null),
      }),
    }),
  ),
});

export type DocsHomeDoorsContent = z.output<typeof docsHomeDoorsSchema>;
type FirstStep = DocsHomeDoorsContent["doors"][number]["firstStep"];

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
