import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 04, labs: one lab inside the hub on a 26-week dial (the field's `labs`
 * scene): the audit, the pilot with the people the hub brings in, the
 * Brain in use, and the Brain going home with the organization. The phase
 * being read lights in the card; the price line closes it.
 */
const phaseSchema = z.object({
  when: z.string(),
  text: z.string(),
});

const labsSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  body: z.string(),
  phases: z.array(phaseSchema).length(4),
  priceName: z.string(),
  priceTerms: z.string(),
  captions: z.object({
    hub: z.string(),
    question: z.string(),
    week: z.string(),
    guests: z.string(),
    organization: z.string(),
    home: z.string(),
    audit: z.string(),
    pilot: z.string(),
    inUse: z.string(),
    end: z.string(),
  }),
});

/** A phase's "when" set on its own lines, broken where it says " · ". */
function lines(when: string): (string | JSX.Element)[] {
  return when
    .split(" · ")
    .flatMap((part, index) =>
      index === 0 ? [part] : [<br key={`br-${index}`} />, part],
    );
}

function LabsSection({
  number,
  label,
  headline,
  body,
  phases,
  priceName,
  priceTerms,
  captions,
}: z.infer<typeof labsSchema>): JSX.Element {
  return (
    <Chapter
      id="labs"
      scene="labs"
      number={number}
      label={label}
      headline={headline}
      length="3"
      captions={captions}
    >
      <p className="hub-text">{body}</p>
      <ol className="hub-phases">
        {phases.map((phase, index) => (
          <li key={phase.when} data-hub-phase={index}>
            <b>{lines(phase.when)}</b>
            <span>{phase.text}</span>
          </li>
        ))}
      </ol>
      <p className="hub-price">
        <strong>{priceName}</strong> · {priceTerms}
      </p>
    </Chapter>
  );
}

export const labs: SectionDefinition = defineSection(labsSchema, LabsSection, {
  title: "04 — Labs",
  description:
    "What a lab is: the chapter's words, its four phases (when, and what happens), the price line, and the drawing's captions ({week} is the lab's week).",
});

export const labsContent: JsonObject = {
  number: "04",
  label: "Labs",
  headline: "A lab, not a *desk*.",
  body: "Organizations come to the hub to work on one question of their own, away from the daily work and next to others doing the same.",
  phases: [
    {
      when: "Weeks 1–3 · The audit",
      text: "Interviews and a workshop: who knows what, where knowledge leaks, and what an agent must never do.",
    },
    {
      when: "The pilot",
      text: "Every decision goes into the lab's Brain with its reasons and sources. The hub brings in the people the question needs.",
    },
    {
      when: "The Brain in use",
      text: "Colleagues outside the lab ask what the team knows, and get answers with the sources behind them.",
    },
    {
      when: "The end",
      text: "The organization takes its Brain home: hosted, on its own servers, or as plain files.",
    },
  ],
  priceName: "The Rizom Lab",
  priceTerms:
    "six months · a team of four · €49,600 excl. VAT, the same in every hub",
  captions: {
    hub: "The hub",
    question: "One question",
    week: "Week {week} / 26",
    guests: "People the hub brings in",
    organization: "The organization",
    home: "Theirs, anywhere",
    audit: "Audit",
    pilot: "Pilot",
    inUse: "Brain in use",
    end: "End",
  },
} satisfies z.input<typeof labsSchema>;
