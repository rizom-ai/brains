import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { sparkPath } from "../field/model";
import { Chapter, Paragraphs, pad } from "./chapter";

/**
 * 03, a hub that remembers: the same cohorts, but each leaves contours
 * around the hub's Brain (the field's `memory` scene). The switch shows the
 * hub without its Brain; the sparkline and the readout show what is on
 * record when each cohort starts.
 */
const memorySchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  paragraphs: z.array(z.string()).min(1),
  withLabel: z.string(),
  withoutLabel: z.string(),
  readoutWith: z.string(),
  readoutWithout: z.string(),
  sparkStart: z.string(),
  sparkEnd: z.string(),
  captions: z.object({
    brain: z.string(),
    hub: z.string(),
    cohort: z.string(),
  }),
});

const firstCohort = (template: string): string =>
  template.replace("{cohort}", pad(1));

function MemorySection({
  number,
  label,
  headline,
  paragraphs,
  withLabel,
  withoutLabel,
  readoutWith,
  readoutWithout,
  sparkStart,
  sparkEnd,
  captions,
}: z.infer<typeof memorySchema>): JSX.Element {
  return (
    <Chapter
      id="memory"
      scene="memory"
      number={number}
      label={label}
      headline={headline}
      length="2.8"
      captions={captions}
    >
      <Paragraphs items={paragraphs} />
      <div className="hub-seg" role="group" aria-label={label}>
        <button type="button" data-hub-memory="on" aria-pressed="true">
          {withLabel}
        </button>
        <button type="button" data-hub-memory="off" aria-pressed="false">
          {withoutLabel}
        </button>
      </div>
      <svg className="hub-spark" viewBox="0 0 300 78" aria-hidden="true">
        <line className="hub-spark__axis" x1="8" y1="62" x2="292" y2="62" />
        <path className="hub-spark__without" d={sparkPath(false)} />
        <path className="hub-spark__with" d={sparkPath(true)} />
        <circle data-hub-spark-dot="" r="3.5" cx="8" cy="62" />
        <text x="8" y="76">
          {sparkStart}
        </text>
        <text x="292" y="76" textAnchor="end">
          {sparkEnd}
        </text>
      </svg>
      <p className="hub-readout">
        <b data-hub-record="">0</b>{" "}
        <span
          data-hub-record-text=""
          data-with={readoutWith}
          data-without={readoutWithout}
        >
          {firstCohort(readoutWith)}
        </span>
      </p>
    </Chapter>
  );
}

export const memory: SectionDefinition = defineSection(
  memorySchema,
  MemorySection,
  {
    title: "03 — A hub that remembers",
    description:
      "How a hub keeps what it learns: paragraphs, the switch's two labels, the readout with a Brain and without ({cohort} is the cohort's number), the sparkline's end labels and the drawing's captions.",
  },
);

export const memoryContent: JsonObject = {
  number: "03",
  label: "A hub that remembers",
  headline: "Each cohort starts where the last *stopped*.",
  paragraphs: [
    "The hub keeps its own memory: who is there, what they know, which introductions worked, what each program learned.",
    "It lives in the hub's Brain, in plain files the hub owns, with an agent that works for the hub and nobody else.",
  ],
  withLabel: "With a Brain",
  withoutLabel: "Without",
  readoutWith: "people and introductions on record when cohort {cohort} starts",
  readoutWithout:
    "on record when cohort {cohort} starts: it begins again from zero",
  sparkStart: "COHORT 01",
  sparkEnd: "04",
  captions: {
    brain: "The hub's Brain",
    hub: "The hub",
    cohort: "Cohort {cohort} of 04",
  },
} satisfies z.input<typeof memorySchema>;
