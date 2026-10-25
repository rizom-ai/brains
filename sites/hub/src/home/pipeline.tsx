import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter, Paragraphs } from "./chapter";

/**
 * 01, the pipeline: the region's brightest lights drain into the center
 * (the field's `pipeline` scene), and the readout counts who has left.
 */
const pipelineSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  paragraphs: z.array(z.string()).min(1),
  readout: z.string(),
  captions: z.object({ center: z.string() }),
});

function PipelineSection({
  number,
  label,
  headline,
  paragraphs,
  readout,
  captions,
}: z.infer<typeof pipelineSchema>): JSX.Element {
  return (
    <Chapter
      id="pipeline"
      scene="pipeline"
      number={number}
      label={label}
      headline={headline}
      length="2.2"
      captions={captions}
    >
      <Paragraphs items={paragraphs} />
      <p className="hub-readout">
        <b data-hub-left="">0</b> {readout}
      </p>
    </Chapter>
  );
}

export const pipeline: SectionDefinition = defineSection(
  pipelineSchema,
  PipelineSection,
  {
    title: "01 — The pipeline",
    description:
      "Why innovation drains a region: the chapter's number, label, headline (*asterisks* for brass italics), paragraphs, the words after the count of who left, and the drawing's caption for the center.",
  },
);

export const pipelineContent: JsonObject = {
  number: "01",
  label: "The pipeline",
  headline: "Innovation runs *one way*.",
  paragraphs: [
    "The way we organize innovation was built for the center. A region finds, trains and funds young companies, and the good outcomes are two: they become a platform, or they are bought by one.",
    "The best companies move or are sold, the founders follow the capital, and what the ecosystem learned along the way leaves with them.",
  ],
  readout: "left the region, and took what they learned",
  captions: { center: "The center" },
} satisfies z.input<typeof pipelineSchema>;
