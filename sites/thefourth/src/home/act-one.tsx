import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Portrait } from "../portrait";
import { ActHeading, TornEdge } from "./act-heading";
import { Eye } from "./eye";
import { KEY_SHAPES, KeyDrawing } from "./keys";
import { ButtonLink, linkSchema, TextLink } from "./links";

/**
 * Act I, the hero: the visitor's work, already good, on the red the keyhole
 * opened into; the act rises over the cover's last stretch. A paper tag on a
 * key says where the key is, and two ways lead on: a diagnosis by email and
 * down to the guide. Beside it a paper arch, a mustard sun, the brain's
 * photo cut out as a keyhole and an eye keeping watch.
 */
const actOneSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  body: z.string(),
  tag: z.object({ line: z.string(), text: z.string() }),
  action: linkSchema,
  more: linkSchema,
  photo: z.string().default(""),
});

function KeyTag({ line, text }: { line: string; text: string }): JSX.Element {
  return (
    <div className="tf-key-tag tf-reveal">
      <svg
        className="tf-key-tag__thread"
        viewBox="0 0 80 60"
        aria-hidden="true"
      >
        <path d="M8 54 C18 30 36 18 64 22" />
      </svg>
      <div className="tf-key-tag__key" aria-hidden="true">
        <KeyDrawing shape={KEY_SHAPES.paddle} />
      </div>
      <div className="tf-key-tag__paper">
        <div className="tf-key-tag__card">
          <span className="tf-key-tag__hole" aria-hidden="true" />
          <p className="tf-story tf-key-tag__line">{line}</p>
          <p className="tf-key-tag__text">{text}</p>
        </div>
      </div>
    </div>
  );
}

function ActOneSection({
  act,
  label,
  opening,
  headline,
  body,
  tag,
  action,
  more,
  photo,
}: z.infer<typeof actOneSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--one">
      <div className="tf-wrap tf-act-one">
        <div className="tf-act-one__words">
          <ActHeading act={act} label={label} opening={opening} light="card" />
          <h2 className="tf-display tf-reveal">{headline}</h2>
          <p className="tf-lede tf-reveal">{body}</p>
          <KeyTag line={tag.line} text={tag.text} />
          <div className="tf-actions tf-reveal">
            <ButtonLink link={action} tone="ink" />
            <TextLink link={more} />
          </div>
        </div>
        <div className="tf-act-one__scene" aria-hidden="true">
          <div className="tf-arch tf-l1" />
          <div className="tf-act-one__sun" />
          <Portrait photo={photo} className="tf-act-one__portrait tf-l3" />
          <div className="tf-act-one__eye">
            <div className="tf-float">
              <Eye iris="var(--palette-ink)" />
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
      "The hero's work, already good: the act, its label, the opening line, the headline, the body, the key's tag (its line and text), the action and the link onward, and an optional photo as ![alt](entity://image/<id>).",
  },
);

export const actOneContent: JsonObject = {
  act: "Act I",
  label: "The hero",
  opening: "Once upon a time,",
  headline: "you made something that matters.",
  body: "The product works. The research holds. The impact is real. Now it needs the right people to understand it.",
  tag: {
    line: "The key is already in what you know.",
    text: "We find it, shape it into a story, and hand it to the people your audience trusts.",
  },
  action: {
    label: "Start with a diagnosis →",
    href: "mailto:nihao.fourth@gmail.com",
  },
  more: { label: "How it works ↓", href: "#guide" },
  photo: "",
} satisfies z.input<typeof actOneSchema>;
