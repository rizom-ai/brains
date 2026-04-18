import type { JSX } from "preact";
import type { WorkProblemContent } from "./schema";
import { Section, renderHighlightedText } from "@brains/site-rizom";

/** rizom.work's highlight voice: italic + accent color. */
const HIGHLIGHT_CLS = "italic text-accent";

export const WorkProblemLayout = ({
  kicker,
  headline,
  subhead,
}: WorkProblemContent): JSX.Element => {
  return (
    <Section id="problem" className="reveal py-section text-center">
      <div className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-6">
        <span>{kicker}</span>
      </div>
      <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[18ch] mx-auto">
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <p className="mt-6 text-body-md md:text-body-xl text-theme-muted max-w-[760px] mx-auto">
        {subhead}
      </p>
    </Section>
  );
};
