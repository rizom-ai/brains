import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Portrait } from "../portrait";
import { ActHeading, TornEdge } from "./act-heading";

/**
 * Act I, the hero: the visitor's work, already good, on the red the keyhole
 * opened into. Beside it a paper arch, the brain's photo cut out as a
 * keyhole and a balloon afloat.
 */
const actOneSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  body: z.string(),
  photo: z.string().default(""),
});

function Balloon(): JSX.Element {
  return (
    <svg viewBox="0 0 120 180" aria-hidden="true">
      <path
        d="M60 4 C28 4 8 28 8 56 C8 86 34 108 48 124 H72 C86 108 112 86 112 56 C112 28 92 4 60 4Z"
        fill="currentColor"
      />
      <path
        d="M60 4 C46 30 44 90 52 124 M60 4 C74 30 76 90 68 124"
        stroke="var(--palette-card)"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M50 124 L46 150 M70 124 L74 150"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <rect x="42" y="150" width="36" height="26" fill="currentColor" />
    </svg>
  );
}

function ActOneSection({
  act,
  label,
  opening,
  headline,
  body,
  photo,
}: z.infer<typeof actOneSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--one">
      <div className="tf-wrap tf-act-one">
        <div className="tf-act-one__words">
          <ActHeading act={act} label={label} opening={opening} light="card" />
          <h2 className="tf-display tf-reveal">{headline}</h2>
          <p className="tf-lede tf-reveal">{body}</p>
        </div>
        <div className="tf-act-one__scene" aria-hidden="true">
          <div className="tf-arch tf-l1" />
          <Portrait photo={photo} className="tf-act-one__portrait tf-l3" />
          <div className="tf-prop tf-prop--balloon">
            <div className="tf-float">
              <Balloon />
            </div>
          </div>
        </div>
      </div>
      <TornEdge />
    </section>
  );
}

export const actOne: SectionDefinition = defineSection(
  actOneSchema,
  ActOneSection,
  {
    title: "Act I — The hero",
    description:
      "The hero's work, already good: the act, its label, the opening line, the headline, the body and an optional photo as ![alt](entity://image/<id>).",
  },
);

export const actOneContent: JsonObject = {
  act: "Act I",
  label: "The hero",
  opening: "Once upon a time,",
  headline: "you made something that matters.",
  body: "The product works. The research holds. The impact is real. You’ve already lived through the first three acts.",
  photo: "",
} satisfies z.input<typeof actOneSchema>;
