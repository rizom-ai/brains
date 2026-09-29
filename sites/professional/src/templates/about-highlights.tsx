import type { JSX } from "react";
import { tagVariants } from "@brains/ui-library";
import type { AboutHighlights } from "../schemas";

/**
 * Generated highlights block, rendered under the about page content.
 */
export const AboutHighlightsLayout = ({
  headline,
  summary,
  themes,
}: AboutHighlights): JSX.Element => (
  <section className="about-highlights container mx-auto px-6 md:px-12 max-w-4xl pb-16 md:pb-24">
    <div className="content-section-reveal border-t border-theme pt-12">
      <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
        In short
      </h2>
      <p className="text-2xl md:text-3xl font-semibold text-heading mb-6">
        {headline}
      </p>
      <p className="text-lg text-theme leading-relaxed mb-8">{summary}</p>
      <ul className="flex flex-wrap gap-3">
        {themes.map((theme) => (
          <li
            key={theme}
            className={tagVariants({ variant: "accent", size: "lg" })}
          >
            {theme}
          </li>
        ))}
      </ul>
    </div>
  </section>
);
