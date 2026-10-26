import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter, Paragraphs } from "./chapter";

/**
 * 01, the intake: the region's brightest lights move into the hub and on
 * to the center (the field's `pipeline` scene), and the readout counts who
 * has left.
 */
const pipelineSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  paragraphs: z.array(z.string()).min(1),
  readout: z.string(),
  captions: z.object({ center: z.string(), hub: z.string() }),
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
    title: "01 — The intake",
    description:
      "How a hub feeds the center: the chapter's number, label, headline (*asterisks* for brass italics), paragraphs, the words after the count of who left, and the drawing's captions for the center and the hub.",
  },
);

export const pipelineContent: JsonObject = {
  number: "01",
  label: "The intake",
  headline: "The hub trains. The center *harvests*.",
  paragraphs: [
    "Most hubs work as the intake of a pipeline built for the center. A region finds its most promising companies, trains them, funds them, and sends them on.",
    "The best ones move or are sold, the founders follow the capital, and what the hub learned along the way leaves with them.",
  ],
  readout: "trained here, then left for the center",
  captions: { center: "The center", hub: "The hub" },
} satisfies z.input<typeof pipelineSchema>;
