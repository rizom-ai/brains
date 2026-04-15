import type { JSX } from "preact";
import type { HeroContent } from "./schema";
import { Button, Section } from "@brains/rizom-ui";

/**
 * Hero section — full-viewport intro with animated rise-in headline,
 * subhead, and CTA row. All copy is content-driven via the
 * HeroContent schema; there are no hardcoded fallbacks. Instances
 * ship their own copy in brain-data/site-content/home/hero.md.
 */
export const HeroLayout = ({
  headline,
  subhead,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: HeroContent): JSX.Element => {
  return (
    <Section
      id="hero"
      className="flex items-center overflow-hidden min-h-[100dvh]"
    >
      <div className="relative z-[2] w-full md:w-[55%] pt-0 md:pt-20">
        <h1 className="font-display font-normal text-[38px] tracking-[-1.5px] leading-[1.05] md:text-display-lg mb-6 opacity-0 animate-hero-rise [animation-delay:0.2s]">
          {headline}
        </h1>
        <p className="font-body text-body-md md:text-body-lg text-theme-muted max-w-full md:max-w-[480px] mb-9 md:mb-10 opacity-0 animate-hero-rise [animation-delay:0.4s]">
          {subhead}
        </p>
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:flex-wrap opacity-0 animate-hero-rise [animation-delay:0.6s]">
          <Button href={primaryCtaHref} variant="primary" block>
            {primaryCtaLabel}
          </Button>
          <Button href={secondaryCtaHref} variant="secondary" block>
            {secondaryCtaLabel}
          </Button>
        </div>
      </div>
      <a className="scroll-cue" href="#features" aria-label="Scroll to content">
        <span>Scroll</span>
        <span className="scroll-cue-line"></span>
      </a>
    </Section>
  );
};
