import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";
import { linkSchema, TextLink } from "./links";

/**
 * The epilogue: every hero needs a guide, and the guides are a click away.
 * The note introduces Sam and Becca and one link leads to the About page,
 * where the cast stands with portraits and bios.
 */
const epilogueSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  note: z.string(),
  // Copy saved before the About page had the guides has no link yet.
  more: linkSchema.default({ label: "Meet the guides →", href: "/about" }),
});

function EpilogueSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  note,
  more,
}: z.infer<typeof epilogueSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--epilogue">
      <div className="tf-wrap tf-epilogue">
        <div className="tf-epilogue__top">
          <div className="tf-epilogue__words">
            <ActHeading
              act={act}
              label={label}
              opening={opening}
              light="mint"
            />
            <p className="tf-epilogue__headline tf-reveal">
              {headline} <em>{emphasis}</em>
            </p>
          </div>
          <div className="tf-epilogue__aside">
            <p className="tf-epilogue__note">{note}</p>
            <TextLink link={more} />
          </div>
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
      "The epilogue: the act's words, the headline and its emphasis, the note, and the link to the guides' page.",
  },
);

export const epilogueContent: JsonObject = {
  act: "Epilogue",
  label: "To be continued",
  opening: "And so, your fourth act begins.",
  headline: "Every hero needs a",
  emphasis: "guide.",
  note: "We’re Sam and Becca. We took the wrong turns so you don’t have to.",
  more: { label: "Meet the guides →", href: "/about" },
} satisfies z.input<typeof epilogueSchema>;
