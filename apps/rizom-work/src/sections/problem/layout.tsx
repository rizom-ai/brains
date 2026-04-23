import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@rizom/ui";
import { WORK_SECTION_HEADLINE, WORK_SECTION_KICKER } from "../styles";
import type { WorkProblemContent } from "./schema";

/** rizom.work's highlight voice: italic + accent color. */
const HIGHLIGHT_CLS = "italic text-accent";

export const WorkProblemLayout = ({
  kicker,
  headline,
  subhead,
}: WorkProblemContent): JSX.Element => {
  return (
    <Section id="problem" className="reveal py-section text-center">
      <div className={`${WORK_SECTION_KICKER} mb-6`}>
        <span>{kicker}</span>
      </div>
      <h2 className={`${WORK_SECTION_HEADLINE} mx-auto max-w-[18ch]`}>
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <p className="mt-6 text-body-md md:text-body-xl text-theme-muted max-w-[760px] mx-auto">
        {subhead}
      </p>
    </Section>
  );
};
