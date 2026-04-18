import type { JSX } from "preact";
import type { CloserContent } from "./schema";
import {
  Button,
  Divider,
  Section,
  renderHighlightedText,
} from "@brains/site-rizom";

/** rizom.work's highlight voice: italic + accent color. */
const HIGHLIGHT_CLS = "italic text-accent";

export const CloserLayout = ({
  preamble,
  headline,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: CloserContent): JSX.Element => {
  return (
    <Section id="cta" className="reveal py-section text-center">
      <Divider className="mb-8 md:mb-10" />
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[560px] mx-auto mb-8">
        {preamble}
      </p>
      <h2 className="font-display text-[40px] md:text-display-xl leading-[0.98] tracking-[-1.6px]">
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:justify-center items-stretch md:items-center mt-9 md:mt-12">
        <Button href={primaryCtaHref} variant="primary" size="lg" block>
          {primaryCtaLabel}
        </Button>
        <Button href={secondaryCtaHref} variant="secondary" size="lg" block>
          {secondaryCtaLabel}
        </Button>
      </div>
    </Section>
  );
};
