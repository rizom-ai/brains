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
 * when The Fourth has them. In Chinese every card carries an eyebrow and a
 * title over its figure, the ink card and Rizom's story a row of stats, and
 * each client's words hang under that client's card.
 */
const statSchema = z.object({ value: z.string(), label: z.string() });

const figureSchema = z.object({
  figure: z.string(),
  unit: z.string(),
  text: z.string(),
  eyebrow: z.string().default(""),
  /** Chinese only: the card's title and its stats. */
  headline: z.string().default(""),
  stats: z.array(statSchema).default([]),
});

const actFourSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  feature: figureSchema,
  figures: z.array(figureSchema),
  story: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    emphasis: z.string().default(""),
    struck: z.string().default(""),
    rest: z.string().default(""),
    photo: z.string().default(""),
    /** Chinese only: the story told as a figure, its text and stats. */
    figure: z.string().default(""),
    unit: z.string().default(""),
    text: z.string().default(""),
    stats: z.array(statSchema).default([]),
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
      {unit && <span className="tf-unit">{unit}</span>}
    </span>
  );
}

type ActFour = z.infer<typeof actFourSchema>;
type Stat = z.infer<typeof statSchema>;
type Testimonial = ActFour["testimonials"][number];

function Stats({ stats }: { stats: Stat[] }): JSX.Element | null {
  if (stats.length === 0) return null;
  return (
    <div className="tf-card__stats">
      {stats.map((stat) => (
        <span key={stat.label} className="tf-card__stat">
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </span>
      ))}
    </div>
  );
}

function Quote({
  testimonial,
  side,
}: {
  testimonial: Testimonial;
  side: "left" | "right";
}): JSX.Element {
  return (
    <figure className={`tf-card tf-card--quote tf-card--quote-${side}`}>
      <span className="tf-card__quote-mark" aria-hidden="true">
        “
      </span>
      <blockquote className="tf-card__quote">{testimonial.quote}</blockquote>
      <figcaption className="tf-eyebrow tf-card__by">
        {testimonial.attribution}
      </figcaption>
    </figure>
  );
}

/** A Chinese card: its eyebrow and title over the figure, then its stats. */
function TitledFigure({
  entry,
  className,
  figureClassName,
}: {
  entry: z.infer<typeof figureSchema>;
  className: string;
  figureClassName: string;
}): JSX.Element {
  return (
    <div className={className}>
      {entry.eyebrow && <span className="tf-eyebrow">{entry.eyebrow}</span>}
      {entry.headline && (
        <span className="tf-card__title">{entry.headline}</span>
      )}
      <Figure
        figure={entry.figure}
        unit={entry.unit}
        className={figureClassName}
      />
      <span className="tf-card__text">{entry.text}</span>
      <Stats stats={entry.stats} />
    </div>
  );
}

/**
 * Act IV in Chinese: the feature and the first figure on top, then two
 * columns, each a client's card with that client's words under it: the ink
 * card with the second testimonial, Rizom's story with the first.
 */
function ActFourChinese({
  act,
  label,
  opening,
  feature,
  figures,
  story,
  testimonials,
}: ActFour): JSX.Element {
  const photo = parsePhoto(story.photo);
  const [first, second] = figures;
  const [right, left] = testimonials;
  return (
    <section className="tf-act tf-act--four">
      <div className="tf-wrap tf-act-four">
        <ActHeading act={act} label={label} opening={opening} light="red" />
        <div className="tf-cards">
          <TitledFigure
            entry={feature}
            className="tf-card tf-card--feature"
            figureClassName="tf-card__figure tf-card__figure--large"
          />
          {first && (
            <TitledFigure
              entry={first}
              className="tf-card tf-card--figure"
              figureClassName="tf-card__figure"
            />
          )}
          <div className="tf-cards__column tf-cards__column--left">
            {second && (
              <TitledFigure
                entry={second}
                className="tf-card tf-card--figure tf-card--ink"
                figureClassName="tf-card__figure"
              />
            )}
            {left && <Quote testimonial={left} side="left" />}
          </div>
          <div className="tf-cards__column tf-cards__column--right">
            <div className="tf-card tf-card--story">
              {photo && (
                <div className="tf-card__photo" aria-hidden="true">
                  <img src={photo.src} alt={photo.alt} loading="lazy" />
                </div>
              )}
              <span className="tf-eyebrow">{story.eyebrow}</span>
              <span className="tf-card__title">{story.headline}</span>
              {story.figure && (
                <Figure
                  figure={story.figure}
                  unit={story.unit}
                  className="tf-card__figure"
                />
              )}
              <span className="tf-card__text">{story.text}</span>
              <Stats stats={story.stats} />
            </div>
            {right && <Quote testimonial={right} side="right" />}
          </div>
        </div>
      </div>
      <TornEdge tone="ink" />
    </section>
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
}: ActFour): JSX.Element {
  const photo = parsePhoto(story.photo);
  return (
    <section className="tf-act tf-act--four">
      <div className="tf-wrap tf-act-four">
        <ActHeading act={act} label={label} opening={opening} light="red" />
        <div className="tf-cards">
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
            <Quote
              key={testimonial.attribution}
              testimonial={testimonial}
              side={index % 2 === 0 ? "right" : "left"}
            />
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
    components: { "zh-TW": ActFourChinese },
    title: "Act IV — The fourth act",
    description:
      "The stories: a feature figure with its eyebrow, two more figures, a story card with its headline, emphasis, the struck jargon, the rest and an optional photo as ![alt](entity://image/<id>), and the testimonials (each a quote and its attribution). Chinese pages give each card a title (headline) and stats, and tell the story as a figure, its text and stats.",
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
