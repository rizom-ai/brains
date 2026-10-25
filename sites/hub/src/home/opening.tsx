import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { emphasize } from "../emphasis";

/**
 * The opening: the hub's name and place, the promise and a cue to scroll,
 * beside the region drawn as a field of lights (the field's `opening`
 * scene, captioned with the hub's coordinates and place).
 */
const openingSchema = z.object({
  eyebrow: z.string(),
  place: z.string(),
  headline: z.string(),
  lede: z.string(),
  cue: z.string(),
  coordinates: z.string(),
});

function OpeningSection({
  eyebrow,
  place,
  headline,
  lede,
  cue,
  coordinates,
}: z.infer<typeof openingSchema>): JSX.Element {
  return (
    <section
      className="hub-ch hub-ch--open"
      id="open"
      data-hub-scene="opening"
      data-hub-caption={`${coordinates} · ${place}`}
    >
      <div className="hub-card">
        <p className="hub-cap">
          {eyebrow} <span>· {place}</span>
        </p>
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
      "The hub's name and place, the headline (wrap a word in *asterisks* to set it in brass italics), the lede, the scroll cue and the hub's coordinates, shown under the field.",
  },
);

export const openingContent: JsonObject = {
  eyebrow: "Rizom Hub",
  place: "Eindhoven",
  headline: "A place that keeps what its ecosystem *learns*.",
  lede: "Organizations, researchers and independent people already meet here to work on questions that matter to them. The hub makes sure what they learn stays: with them, with the hub, and with whoever comes next.",
  cue: "Scroll to see why",
  coordinates: "51.44° N · 5.47° E",
} satisfies z.input<typeof openingSchema>;
