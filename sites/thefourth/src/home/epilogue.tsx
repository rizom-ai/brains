import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { parsePhoto, Portrait } from "../portrait";
import { ActHeading } from "./act-heading";

/**
 * The epilogue: every hero needs a guide. The two guides sway on sticks as
 * keyhole cut-outs when the brain has their portraits, and the fourth act
 * starts by email.
 */
const linkSchema = z.object({ label: z.string(), href: z.string() });

const epilogueSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  guides: z.array(z.object({ photo: z.string().default("") })),
  guidesNote: z.string(),
  action: linkSchema,
  contact: linkSchema,
});

/** "Every hero needs a" breaks after its second word, as the design sets it. */
function brokenAfterTwo(text: string): (string | JSX.Element)[] {
  const words = text.split(" ");
  if (words.length <= 2) return [text];
  return [
    words.slice(0, 2).join(" "),
    <br key="break" />,
    words.slice(2).join(" "),
  ];
}

function EpilogueSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  guides,
  guidesNote,
  action,
  contact,
}: z.infer<typeof epilogueSchema>): JSX.Element {
  // A guide without a portrait would be a bare stick.
  const pictured = guides.filter((guide) => parsePhoto(guide.photo));
  return (
    <section className="tf-act tf-act--epilogue">
      <div className="tf-wrap tf-epilogue">
        <ActHeading act={act} label={label} opening={opening} light="mint" />
        <div className="tf-epilogue__row">
          <p className="tf-epilogue__headline tf-reveal">
            {brokenAfterTwo(headline)} <em>{emphasis}</em>
          </p>
          <div className="tf-guides">
            {pictured.length > 0 && (
              <div className="tf-guides__sticks" aria-hidden="true">
                {pictured.map((guide, index) => (
                  <div
                    key={`${index}-${guide.photo}`}
                    className={
                      index % 2 === 1 ? "tf-guide tf-guide--late" : "tf-guide"
                    }
                  >
                    <Portrait photo={guide.photo} />
                    <div className="tf-guide__stick" />
                  </div>
                ))}
              </div>
            )}
            <p className="tf-guides__note">{guidesNote}</p>
          </div>
        </div>
        <div className="tf-epilogue__ways">
          <a className="tf-pill tf-pill--red tf-pill--large" href={action.href}>
            {action.label}
          </a>
          <a className="tf-epilogue__contact" href={contact.href}>
            {contact.label}
          </a>
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
      "The epilogue: the act's words, the headline and its emphasis, the guides' portraits as ![alt](entity://image/<id>), the note, the action and the contact link.",
  },
);

export const epilogueContent: JsonObject = {
  act: "Epilogue",
  label: "To be continued",
  opening: "And so, your fourth act begins.",
  headline: "Every hero needs a",
  emphasis: "guide.",
  guides: [{ photo: "" }, { photo: "" }],
  guidesNote:
    "Your guides, Sam & Becca. We took the wrong turns so you don’t have to.",
  action: {
    label: "Start your fourth act →",
    href: "mailto:nihao.fourth@gmail.com",
  },
  contact: {
    label: "nihao.fourth@gmail.com",
    href: "mailto:nihao.fourth@gmail.com",
  },
} satisfies z.input<typeof epilogueSchema>;
