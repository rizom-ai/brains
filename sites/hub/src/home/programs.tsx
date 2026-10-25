import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 02, programs end: cohorts gather around one connector and scatter when
 * the program ends (the field's `programs` scene). "Let the connector
 * leave" cuts every thread; the words and the readout change with it.
 */
const programsSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  body: z.string(),
  bodyWithoutConnector: z.string(),
  leaveLabel: z.string(),
  returnLabel: z.string(),
  readout: z.string(),
  readoutWithoutConnector: z.string(),
  captions: z.object({
    hub: z.string(),
    connector: z.string(),
    inProgram: z.string(),
    programEnds: z.string(),
  }),
});

function ProgramsSection({
  number,
  label,
  headline,
  body,
  bodyWithoutConnector,
  leaveLabel,
  returnLabel,
  readout,
  readoutWithoutConnector,
  captions,
}: z.infer<typeof programsSchema>): JSX.Element {
  return (
    <Chapter
      id="programs"
      scene="programs"
      number={number}
      label={label}
      headline={headline}
      length="2.6"
      captions={captions}
    >
      <p
        className="hub-text"
        data-hub-connector-body=""
        data-with={body}
        data-without={bodyWithoutConnector}
      >
        {body}
      </p>
      <button
        type="button"
        className="hub-act"
        data-hub-connector=""
        data-leave={leaveLabel}
        data-return={returnLabel}
      >
        {leaveLabel}
      </button>
      <p className="hub-readout">
        <b data-hub-cohort="">01</b>{" "}
        <span
          data-hub-cohort-text=""
          data-with={readout}
          data-without={readoutWithoutConnector}
        >
          {readout}
        </span>
      </p>
    </Chapter>
  );
}

export const programs: SectionDefinition = defineSection(
  programsSchema,
  ProgramsSection,
  {
    title: "02 — Programs end",
    description:
      "Why every program starts from zero: the chapter's words with the connector and without, the button's two labels, the readout after the cohort number with the connector and without, and the drawing's captions ({cohort} is the cohort's number).",
  },
);

export const programsContent: JsonObject = {
  number: "02",
  label: "Programs end",
  headline: "Every program starts *from zero*.",
  body: "A hub lives on programs and calls. Funding comes in cycles, people move on between them, and what holds it all together is usually one person: the connector who knows everyone.",
  bodyWithoutConnector:
    "The introductions, the history of each cohort, the reasons things were done the way they were: they left with one person. Heroics are not infrastructure.",
  leaveLabel: "Let the connector leave",
  returnLabel: "Bring them back",
  readout: "cohort of 03 · carried over from the last one: nothing",
  readoutWithoutConnector:
    "cohort · the connector has left; nobody knows whom to call",
  captions: {
    hub: "The hub",
    connector: "The connector",
    inProgram: "Cohort {cohort} · in the program",
    programEnds: "Cohort {cohort} · program ends",
  },
} satisfies z.input<typeof programsSchema>;
