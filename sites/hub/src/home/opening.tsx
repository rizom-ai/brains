import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { emphasize } from "../emphasis";

/**
 * The opening: the hub's name, the promise and a cue to scroll, beside the
 * region drawn as a field of lights (the field's `opening` scene).
 */
const openingSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  cue: z.string(),
});

function OpeningSection({
  eyebrow,
  headline,
  lede,
  cue,
}: z.infer<typeof openingSchema>): JSX.Element {
  return (
    <section
      className="hub-ch hub-ch--open"
      id="open"
      data-hub-scene="opening"
      data-hub-label="Open"
    >
      <div className="hub-card">
        <p className="hub-cap">{eyebrow}</p>
        <h1 className="hub-title">{emphasize(headline)}</h1>
        <p className="hub-lede">{lede}</p>
        <p className="hub-cue">
          <i aria-hidden="true" />
          {cue}
        </p>
      </div>
    </section>
  );
}

export const opening: SectionDefinition = defineSection(
  openingSchema,
  OpeningSection,
  {
    title: "Opening",
    description:
      "The hub's name, the headline (wrap a word in *asterisks* to set it in brass italics), the lede and the scroll cue.",
  },
);

export const openingContent: JsonObject = {
  eyebrow: "Rizom Hub",
  headline: "A place that keeps what its ecosystem *learns*.",
  lede: "Organizations, researchers and independent people already meet here to work on questions that matter to them. The hub makes sure what they learn stays: with them, with the hub, and with whoever comes next.",
  cue: "Scroll to see why",
} satisfies z.input<typeof openingSchema>;
