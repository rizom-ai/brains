/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { CloserContent } from "./schema";
import { Section, renderHighlightedText } from "@brains/site-rizom";
import { WorkButton } from "../../link-targets";
import { WORK_RULE } from "../styles";

const HIGHLIGHT_CLS = "italic text-accent font-normal";

export const CloserLayout = ({
  preamble,
  headline,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: CloserContent): JSX.Element => {
  return (
    <Section
      id="cta"
      className="reveal pt-[128px] pb-[144px] text-center max-[768px]:pt-20 max-[768px]:pb-24"
    >
      <div className={`${WORK_RULE} mb-12 max-[768px]:mb-9`} />
      {preamble && (
        <p className="mx-auto mb-10 max-w-[560px] font-body text-[18px] italic leading-[1.7] text-theme-light max-[768px]:mb-7 max-[768px]:text-[15px]">
          {preamble}
        </p>
      )}
      <h2 className="font-display text-[clamp(40px,6vw,80px)] font-[520] leading-[0.98] tracking-[-2px] text-theme max-[768px]:text-[35px] max-[768px]:leading-[1.04] max-[768px]:tracking-[-1px]">
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <div className="mt-14 flex flex-wrap justify-center gap-5 max-[768px]:mt-10 max-[768px]:flex-col max-[768px]:items-stretch max-[768px]:gap-3 max-[768px]:[&_.rizom-btn]:w-full max-[768px]:[&_.rizom-btn]:justify-center max-[768px]:[&_.rizom-btn]:px-6 max-[768px]:[&_.rizom-btn]:py-4 max-[768px]:[&_.rizom-btn]:text-[16px]">
        <WorkButton
          href={primaryCtaHref}
          variant="primary"
          className="text-[18px] md:px-11 md:py-5"
        >
          {primaryCtaLabel}
        </WorkButton>
        <WorkButton
          href={secondaryCtaHref}
          variant="secondary"
          className="text-[18px] md:px-11 md:py-5"
        >
          {secondaryCtaLabel}
        </WorkButton>
      </div>
    </Section>
  );
};
