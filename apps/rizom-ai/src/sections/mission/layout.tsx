import type { JSX } from "preact";
import type { MissionContent } from "./schema";
import {
  Button,
  Divider,
  Section,
  renderHighlightedText,
} from "@brains/site-rizom";

/**
 * Mission's highlight uses wider negative insets so the mid-line
 * extends past the highlighted word on both sides — same move as the
 * original split-field layout, now driven by inline `*...*`.
 */
const HIGHLIGHT_CLS =
  "inline-block relative text-accent before:content-[''] before:absolute before:left-[-8%] before:right-[-8%] before:top-1/2 before:h-px before:bg-[var(--color-highlight-underline)] before:opacity-50";

export const MissionLayout = ({
  preamble,
  headline,
  post,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: MissionContent): JSX.Element => {
  return (
    <Section id="mission" className="reveal py-section text-center">
      <Divider className="mb-10 md:mb-12" />
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[520px] mx-auto mb-8 md:mb-10">
        {preamble}
      </p>
      <h2 className="font-display font-bold text-display-xl">
        {renderHighlightedText(headline, HIGHLIGHT_CLS)}
      </h2>
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[500px] mx-auto mt-8">
        {post}
      </p>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:justify-center items-stretch md:items-center mt-9 md:mt-16">
        <Button href={primaryCtaHref} variant="primary-strong" size="lg" block>
          {primaryCtaLabel}
        </Button>
        <Button href={secondaryCtaHref} variant="secondary" size="lg" block>
          {secondaryCtaLabel}
        </Button>
      </div>
    </Section>
  );
};
