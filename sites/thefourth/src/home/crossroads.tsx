import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";

/**
 * Your turn, the crossroads: a dark stage, a spotlight and three signposts
 * swinging on one pole. "Which way?" leads to the brand test once the test
 * has a link; until then the test's lines stay off the page.
 */
const crossroadsSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  signs: z.array(z.string()),
  test: z.object({
    text: z.string(),
    label: z.string(),
    href: z.string().default(""),
  }),
});

function Signpost({
  text,
  pointsRight,
}: {
  text: string;
  pointsRight: boolean;
}): JSX.Element {
  return (
    <svg viewBox="0 0 200 80" aria-hidden="true">
      <rect x="2" y="2" width="196" height="76" rx="6" fill="currentColor" />
      <path
        d={
          pointsRight
            ? "M30 30 H150 V18 L186 40 L150 62 V50 H30Z"
            : "M170 30 H50 V18 L14 40 L50 62 V50 H170Z"
        }
        fill="var(--palette-card)"
      />
      <text
        x={pointsRight ? 92 : 108}
        y="47"
        fontFamily="Inter Tight, Arial, sans-serif"
        fontWeight="800"
        fontSize="17"
        textAnchor="middle"
        fill="currentColor"
        letterSpacing="1"
      >
        {text}
      </text>
    </svg>
  );
}

function CrossroadsSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  signs,
  test,
}: z.infer<typeof crossroadsSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--crossroads">
      <div className="tf-wrap tf-crossroads">
        <ActHeading act={act} label={label} opening={opening} light="mustard" />
        <div className="tf-crossroads__row">
          <div className="tf-crossroads__words">
            <h2 className="tf-crossroads__headline tf-reveal">
              {headline} <em>{emphasis}</em>
            </h2>
            {test.href && (
              <>
                <p className="tf-lede">{test.text}</p>
                <div>
                  <a
                    className="tf-pill tf-pill--mustard tf-pill--large"
                    href={test.href}
                  >
                    {test.label}
                  </a>
                </div>
              </>
            )}
          </div>
          <div className="tf-crossroads__scene" aria-hidden="true">
            <div className="tf-spotlight" />
            <div className="tf-pole" />
            {signs.map((sign, index) => (
              <div key={sign} className={`tf-sign tf-sign--${index + 1}`}>
                <div
                  className={
                    index % 2 === 1 ? "tf-swing tf-swing--back" : "tf-swing"
                  }
                >
                  <Signpost text={sign} pointsRight={index % 2 === 0} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export const crossroads: SectionDefinition = defineSection(
  crossroadsSchema,
  CrossroadsSection,
  {
    title: "Your turn — The crossroads",
    description:
      "The crossroads: the act's words, the headline and its emphasis, the signposts, and the brand test, shown once it has a link.",
  },
);

export const crossroadsContent: JsonObject = {
  act: "Your turn",
  label: "The crossroads",
  opening: "Now you’re standing at a crossroads.",
  headline: "Which",
  emphasis: "way?",
  signs: ["THIS WAY", "THAT WAY", "YOUR WAY"],
  test: {
    text: "Find out what kind of brand you are in three minutes. Results may be uncomfortably accurate.",
    label: "Take the test →",
    href: "",
  },
} satisfies z.input<typeof crossroadsSchema>;
