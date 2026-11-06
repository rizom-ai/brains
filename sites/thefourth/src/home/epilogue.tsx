import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { parsePhoto } from "../portrait";
import { ActHeading } from "./act-heading";

/**
 * The epilogue: every hero needs a guide, and here they are. Each guide
 * stands in the team with a name, a bio and areas of expertise as outlined
 * tags; when the brain has a portrait, the first stands under an arch on a
 * red disc, the next in a circle on a mint one. Two guides sit side by side
 * and stack on a phone. The story ends here, without a button.
 */
const guideSchema = z.object({
  name: z.string(),
  photo: z.string().default(""),
  bio: z.string().default(""),
  expertise: z.array(z.string()).default([]),
});

const epilogueSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  note: z.string(),
  expertiseLabel: z.string().default("Areas of expertise"),
  guides: z.array(guideSchema),
});

function Member({
  guide,
  shape,
  expertiseLabel,
}: {
  guide: z.infer<typeof guideSchema>;
  shape: "arch" | "circle";
  expertiseLabel: string;
}): JSX.Element {
  const photo = parsePhoto(guide.photo);
  return (
    <article className="tf-member tf-reveal">
      {photo && (
        <div className={`tf-member__portrait tf-member__portrait--${shape}`}>
          <div className="tf-member__disc" aria-hidden="true" />
          <div className="tf-member__frame">
            <img src={photo.src} alt={photo.alt} loading="lazy" />
          </div>
        </div>
      )}
      <h3 className="tf-member__name">{guide.name}</h3>
      {guide.bio && <p className="tf-member__bio">{guide.bio}</p>}
      {guide.expertise.length > 0 && (
        <div className="tf-member__expertise">
          <span className="tf-eyebrow tf-member__label">{expertiseLabel}</span>
          <ul className="tf-member__tags">
            {guide.expertise.map((area) => (
              <li key={area} className="tf-member__tag">
                {area}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function EpilogueSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  note,
  expertiseLabel,
  guides,
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
          <p className="tf-epilogue__note">{note}</p>
        </div>
        <div className="tf-team">
          {guides.map((guide, index) => (
            <Member
              key={guide.name}
              guide={guide}
              shape={index % 2 === 1 ? "circle" : "arch"}
              expertiseLabel={expertiseLabel}
            />
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
      "The epilogue: the act's words, the headline and its emphasis, the note, the label over each guide's expertise, and the guides (each a name, a portrait as ![alt](entity://image/<id>), a bio and areas of expertise).",
  },
);

export const epilogueContent: JsonObject = {
  act: "Epilogue",
  label: "To be continued",
  opening: "And so, your fourth act begins.",
  headline: "Every hero needs a",
  emphasis: "guide.",
  note: "We’re Sam and Becca. We took the wrong turns so you don’t have to.",
  expertiseLabel: "Areas of expertise",
  guides: [
    {
      name: "Samantha Shao",
      photo: "",
      bio: "Samantha Shao is co-founder of The Fourth, where she leads brand strategy and client partnerships, translating complex work in sustainability, technology, and culture into stories audiences follow. Trained in contemporary art and cultural analysis, she spent nine years in communications across London, Berlin, and New York before founding the company. She is now leading the development of ContentDNA, an AI-assisted system that matches brands and creators by shared values and emotional resonance.",
      expertise: [
        "Strategic Communications",
        "Cultural Analysis & Brand Localization",
        "CSR/ESG Communications",
        "Integrated Marketing & Brand Strategy",
        "Creative Content & Communication Innovation",
      ],
    },
    {
      name: "Becca Chen",
      photo: "",
      bio: "Becca Chen is co-founder and CEO of The Fourth, where she leads content strategy and creator partnerships, finding the cultural story inside a brand and shaping it into content audiences come back to. Trained as a historian, she began in cultural revitalization, leading community projects in Keelung, then helped grow Story Studio, one of Taiwan’s leading history media platforms. Since 2020 she has focused on video and short-form strategy, working with creators including Plain Law Movement (法律白話文運動) and 呂呂. At The Fourth, she also leads the content classification work behind ContentDNA.",
      expertise: [
        "Short-form video and content strategy",
        "Content classification",
        "Creator partnerships",
        "Digital Media Trends",
        "Video production",
      ],
    },
  ],
} satisfies z.input<typeof epilogueSchema>;
