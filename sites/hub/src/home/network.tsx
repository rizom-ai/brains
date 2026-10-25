import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter, Paragraphs } from "./chapter";

/**
 * 06, the network: the view widens until this hub is one of many, each
 * linked to its nearest neighbors and none in the middle (the field's
 * `network` scene). Tapping the field plants another hub; the readout
 * counts them.
 */
const networkSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  paragraphs: z.array(z.string()).min(1),
  hint: z.string(),
  readout: z.string(),
  note: z.string(),
  captions: z.object({ ours: z.string() }),
});

function NetworkSection({
  number,
  label,
  headline,
  paragraphs,
  hint,
  readout,
  note,
  captions,
}: z.infer<typeof networkSchema>): JSX.Element {
  return (
    <Chapter
      id="network"
      scene="network"
      number={number}
      label={label}
      headline={headline}
      length="2.2"
      captions={captions}
    >
      <Paragraphs items={paragraphs} />
      <p className="hub-hint">{hint}</p>
      <p className="hub-readout">
        <b data-hub-hubs="">1</b> {readout}
      </p>
      <p className="hub-note">{note}</p>
    </Chapter>
  );
}

export const network: SectionDefinition = defineSection(
  networkSchema,
  NetworkSection,
  {
    title: "06 — The network",
    description:
      "How hubs connect: paragraphs, the invitation to tap the field, the words after the count of hubs, the note on the federation layer, and the caption for this hub in the drawing.",
  },
);

export const networkContent: JsonObject = {
  number: "06",
  label: "The network",
  headline: "Many hubs, *no center*.",
  paragraphs: [
    "The hub's Brain connects to other hubs, at home and abroad. Organizations and members find each other's expertise across them, within what each allows.",
    "Growth comes from connection rather than concentration. Every hub stays itself, and none of them is the center.",
  ],
  hint: "Tap the field to add a hub",
  readout: "hubs connected · centers: none",
  note: "The federation layer is in development; the first hubs run on its first version.",
  captions: { ours: "This hub" },
} satisfies z.input<typeof networkSchema>;
