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
 * hub drawn as a lantern that programs flow in to, circle and leave (the
 * field's `opening` scene, which captions the lantern).
 */
const openingSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  lede: z.string(),
  cue: z.string(),
  hubCaption: z.string(),
});

function OpeningSection({
  eyebrow,
  headline,
  lede,
  cue,
  hubCaption,
}: z.infer<typeof openingSchema>): JSX.Element {
  return (
    <section
      className="hub-ch hub-ch--open"
      id="open"
      data-hub-scene="opening"
      data-hub-label="Open"
      data-hub-captions={JSON.stringify({ hub: hubCaption })}
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
      "The hub's name, the headline (wrap a word in *asterisks* to set it in brass italics), the lede, the scroll cue and the caption under the hub in the drawing.",
  },
);

export const openingContent: JsonObject = {
  eyebrow: "Rizom Hub",
  headline: "Programs come and go. The hub *stays*.",
  lede: "Every ecosystem has places where companies, researchers, public bodies and capital meet. Programs pass through them; the place remains. This hub is built to keep what passes through it.",
  cue: "Scroll to see why",
  hubCaption: "The hub",
} satisfies z.input<typeof openingSchema>;
