import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@rizom/ui";
import { WORK_KICKER, WORK_SECTION_HEADLINE } from "../styles";
import type { WorkProblemContent } from "./schema";

const HIGHLIGHT_CLS = "italic text-accent font-normal";

export const WorkProblemLayout = ({
  kicker,
  headline,
  subhead,
}: WorkProblemContent): JSX.Element => {
  return (
    <Section
      id="problem"
      className="reveal bg-transparent py-[128px] text-center max-[768px]:py-20"
    >
      <span className={`${WORK_KICKER} mb-8 max-[768px]:mb-6`}>{kicker}</span>
      <h2
        className={`${WORK_SECTION_HEADLINE} mx-auto mb-7 max-w-[900px] max-[768px]:mb-5`}
      >
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <p className="mx-auto max-w-[720px] font-body text-[19px] leading-[1.72] text-theme-muted max-[768px]:text-[16px] max-[768px]:leading-[1.68]">
        {subhead}
      </p>
    </Section>
  );
};
