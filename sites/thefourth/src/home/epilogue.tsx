import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { parsePhoto } from "../portrait";
import { ActHeading } from "./act-heading";
import { ButtonLink, linkSchema } from "./links";

/**
 * The epilogue: every hero needs a guide. The guides stand beside it by
 * name, the first under an arch, the second in a circle, on red and mint
 * discs, when the brain has their portraits; the fourth act starts by
 * email.
 */
const epilogueSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  note: z.string(),
  guides: z.array(
    z.object({ name: z.string(), photo: z.string().default("") }),
  ),
  action: linkSchema,
});

function EpilogueSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  note,
  guides,
  action,
}: z.infer<typeof epilogueSchema>): JSX.Element {
  const pictured = guides.flatMap((guide) => {
    const photo = parsePhoto(guide.photo);
    return photo ? [{ name: guide.name, photo }] : [];
  });
  return (
    <section className="tf-act tf-act--epilogue">
      <div className="tf-wrap tf-epilogue">
        <div className="tf-epilogue__words">
          <ActHeading act={act} label={label} opening={opening} light="mint" />
          <p className="tf-epilogue__headline tf-reveal">
            {headline} <em>{emphasis}</em>
          </p>
          <p className="tf-epilogue__note">{note}</p>
          <div className="tf-actions">
            <ButtonLink link={action} tone="red" />
          </div>
        </div>
        <div className="tf-epilogue__scene">
          <div
            className="tf-epilogue__disc tf-epilogue__disc--red tf-l1"
            aria-hidden="true"
          />
          <div
            className="tf-epilogue__disc tf-epilogue__disc--mint tf-l1"
            aria-hidden="true"
          />
          {pictured.map((guide, index) => (
            <figure
              key={guide.photo.src}
              className={
                index % 2 === 1
                  ? "tf-guide tf-guide--disc"
                  : "tf-guide tf-guide--arch"
              }
            >
              <div className="tf-guide__frame">
                <img
                  src={guide.photo.src}
                  alt={guide.photo.alt}
                  loading="lazy"
                />
              </div>
              <figcaption className="tf-eyebrow">{guide.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export const epilogue: SectionDefinition = defineSection(
  epilogueSchema,
  EpilogueSection,
  {
    title: "Epilogue — To be continued",
    description:
      "The epilogue: the act's words, the headline and its emphasis, the note, the guides (each a name and a portrait as ![alt](entity://image/<id>)) and the action.",
  },
);

export const epilogueContent: JsonObject = {
  act: "Epilogue",
  label: "To be continued",
  opening: "And so, your fourth act begins.",
  headline: "Every hero needs a",
  emphasis: "guide.",
  note: "We’re Sam and Becca. We took the wrong turns so you don’t have to.",
  guides: [
    { name: "Samantha Shao", photo: "" },
    { name: "Becca Chen", photo: "" },
  ],
  action: {
    label: "Start your fourth act →",
    href: "mailto:nihao.fourth@gmail.com",
  },
} satisfies z.input<typeof epilogueSchema>;
