import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { parsePhoto } from "../portrait";
import { ActHeading, TornEdge } from "./act-heading";

/**
 * Act IV, the fourth act: the stories, pinned as tilted cards. The museum's
 * feature card, two figures (the second in ink), Rizom's story on red with
 * its photo across the top when the content names one, and the clients'
 * words on paper: the first beside Rizom's story, the next on the other
 * side, tilted the other way. The cards are not links; story pages come
 * when The Fourth has them.
 */
const figureSchema = z.object({
  figure: z.string(),
  unit: z.string(),
  text: z.string(),
});

const actFourSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  feature: figureSchema.extend({ eyebrow: z.string() }),
  figures: z.array(figureSchema),
  story: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    emphasis: z.string(),
    struck: z.string(),
    rest: z.string(),
    photo: z.string().default(""),
  }),
  testimonials: z
    .array(z.object({ quote: z.string(), attribution: z.string() }))
    .default([]),
});

function Figure({
  figure,
  unit,
  className,
}: {
  figure: string;
  unit: string;
  className: string;
}): JSX.Element {
  return (
    <span className={className}>
      {figure}
      <span className="tf-unit">{unit}</span>
    </span>
  );
}

function ActFourSection({
  act,
  label,
  opening,
  feature,
  figures,
  story,
  testimonials,
}: z.infer<typeof actFourSchema>): JSX.Element {
  const photo = parsePhoto(story.photo);
  return (
    <section className="tf-act tf-act--four">
      <div className="tf-wrap tf-act-four">
        <ActHeading act={act} label={label} opening={opening} light="red" />
        <div className="tf-cards tf-stack">
          <div className="tf-card tf-card--feature">
            <span className="tf-eyebrow">{feature.eyebrow}</span>
            <Figure
              figure={feature.figure}
              unit={feature.unit}
              className="tf-card__figure tf-card__figure--large"
            />
            <span className="tf-story tf-card__line">{feature.text}</span>
          </div>
          {figures.map((entry, index) => (
            <div
              key={entry.figure}
              className={
                index === 1
                  ? "tf-card tf-card--figure tf-card--ink"
                  : "tf-card tf-card--figure"
              }
            >
              <Figure
                figure={entry.figure}
                unit={entry.unit}
                className="tf-card__figure"
              />
              <span className="tf-card__text">{entry.text}</span>
            </div>
          ))}
          <div className="tf-card tf-card--story">
            {photo && (
              <div className="tf-card__photo" aria-hidden="true">
                <img src={photo.src} alt={photo.alt} loading="lazy" />
              </div>
            )}
            <span className="tf-eyebrow">{story.eyebrow}</span>
            <span className="tf-card__headline">
              {story.headline} <em>{story.emphasis}</em>
            </span>
            <span className="tf-card__text">
              <s>{story.struck}</s> {story.rest}
            </span>
          </div>
          {testimonials.map((testimonial, index) => (
            <figure
              key={testimonial.attribution}
              className={`tf-card tf-card--quote tf-card--quote-${index % 2 === 0 ? "right" : "left"}`}
            >
              <span className="tf-card__quote-mark" aria-hidden="true">
                “
              </span>
              <blockquote className="tf-card__quote">
                {testimonial.quote}
              </blockquote>
              <figcaption className="tf-eyebrow tf-card__by">
                {testimonial.attribution}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <TornEdge tone="ink" />
    </section>
  );
}

export const actFour: SectionDefinition = defineSection(
  actFourSchema,
  ActFourSection,
  {
    title: "Act IV — The fourth act",
    description:
      "The stories: a feature figure with its eyebrow, two more figures, a story card with its headline, emphasis, the struck jargon, the rest and an optional photo as ![alt](entity://image/<id>), and the testimonials (each a quote and its attribution).",
  },
);

export const actFourContent: JsonObject = {
  act: "Act IV",
  label: "The fourth act",
  opening: "And then, finally, the right people got it.",
  feature: {
    eyebrow: "Art & Culture · New Taipei City Art Museum",
    figure: "158,000",
    unit: "+",
    text: "impressions for contemporary art, from people who thought it wasn’t for them.",
  },
  figures: [
    {
      figure: "100,000",
      unit: "+",
      text: "views on a single Reel, from a law creator talking about art.",
    },
    {
      figure: "7.7",
      unit: "%",
      text: "engagement for a history podcaster, well above platform average.",
    },
  ],
  story: {
    eyebrow: "Tech & AI · Rizom",
    headline: "Academic idea →",
    emphasis: "obvious problem.",
    struck: "“Transactive Memory Systems”",
    rest: "became “what would your team forget?”",
    photo: "",
  },
  testimonials: [
    {
      quote:
        "The right branding also helps us find the right business model, and The Fourth knows what they’re doing.",
      attribution: "Founder, Rizom",
    },
    {
      quote:
        "Mid-size businesses like us don’t have big budgets for marketing, but The Fourth helped us put our money in the right places.",
      attribution: "Deputy Manager, TWTN",
    },
  ],
} satisfies z.input<typeof actFourSchema>;
