import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 04, what passes through: a lab beside the hub on a 26-week dial (the
 * field's `labs` scene). The organization's team arrives, the hub's members
 * come over to deliver, other labs run beside it, and the lab's Brain goes
 * home with the organization. The phase being read lights in the card; the
 * price line closes it.
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
    week: z.string(),
    members: z.string(),
    organization: z.string(),
    home: z.string(),
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
  title: "04 — What passes through",
  description:
    "What passes through the hub: the chapter's words, a lab's four phases (when, and what happens), the price line, and the drawing's captions ({week} is the lab's week).",
});

export const labsContent: JsonObject = {
  number: "04",
  label: "What passes through",
  headline: "Organizations come with a question. They leave with a *Brain*.",
  body: "A lab is six months, a team of four and one question of the organization's own, worked on at the hub, next to other labs and the people the hub brings in. Members who work for themselves certify here and deliver the labs.",
  phases: [
    {
      when: "Weeks 1–3 · The audit",
      text: "Interviews and a workshop: who knows what, where knowledge leaks, and what an agent must never do.",
    },
    {
      when: "The pilot",
      text: "Every decision goes into the lab's Brain with its reasons and sources. The hub's members work alongside the team.",
    },
    {
      when: "The Brain in use",
      text: "Colleagues outside the lab ask what the team knows, and get answers with the sources behind them.",
    },
    {
      when: "The end",
      text: "The organization takes its Brain home. The hub keeps what the lab taught about the work, never its content.",
    },
  ],
  priceName: "The Rizom Lab",
  priceTerms:
    "six months · a team of four · €49,600 excl. VAT, the same in every hub",
  captions: {
    hub: "The hub",
    week: "A lab · week {week} / 26",
    members: "Members deliver",
    organization: "The organization",
    home: "Theirs, anywhere",
  },
} satisfies z.input<typeof labsSchema>;
