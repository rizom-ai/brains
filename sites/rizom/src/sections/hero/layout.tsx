import type { JSX } from "preact";
import type { HeroContent } from "./schema";

/**
 * Hero section — full-viewport intro with animated rise-in headline,
 * subhead, and CTA row. Matches docs/design/rizom-ai.themed.html hero.
 *
 * Typography uses the bundled text-display-lg / text-body-lg tokens
 * (font-size + line-height + letter-spacing all in one class).
 */
export const HeroLayout = ({
  headline = "Build the agent that represents you",
  subhead = "Your knowledge becomes an AI agent. Your agent joins a network. The network finds the right expert for every problem — matched by what people actually know.",
  primaryCtaLabel = "Get Your Brain →",
  primaryCtaHref = "#quickstart",
  secondaryCtaLabel = "How The Network Works",
  secondaryCtaHref = "#answer",
}: HeroContent): JSX.Element => {
  return (
    <section
      id="hero"
      className="px-6 md:px-10 lg:px-20 relative z-[1] flex items-center overflow-hidden min-h-[100dvh]"
    >
      <div className="relative z-[2] w-full md:w-[55%] pt-0 md:pt-20">
        <h1 className="font-display font-normal text-[38px] tracking-[-1.5px] leading-[1.05] md:text-display-lg mb-6 opacity-0 animate-hero-rise [animation-delay:0.2s]">
          {headline}
        </h1>
        <p className="font-body text-body-md md:text-body-lg text-theme-muted max-w-full md:max-w-[480px] mb-9 md:mb-10 opacity-0 animate-hero-rise [animation-delay:0.4s]">
          {subhead}
        </p>
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:flex-wrap opacity-0 animate-hero-rise [animation-delay:0.6s]">
          <a
            href={primaryCtaHref}
            className="inline-flex items-center gap-2 font-body text-base font-semibold text-white bg-accent hover:bg-accent-dark rounded-[10px] px-8 py-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(232,119,34,0.3)] w-full md:w-auto justify-center md:justify-start"
          >
            {primaryCtaLabel}
          </a>
          <a
            href={secondaryCtaHref}
            className="inline-flex items-center gap-2 font-body text-base font-medium text-theme bg-white/[0.04] border border-white/15 hover:border-white/40 hover:bg-white/[0.08] rounded-[10px] px-8 py-4 cursor-pointer transition-all w-full md:w-auto justify-center md:justify-start"
          >
            {secondaryCtaLabel}
          </a>
        </div>
      </div>
      <a className="scroll-cue" href="#features" aria-label="Scroll to content">
        <span>Scroll</span>
        <span className="scroll-cue-line"></span>
      </a>
    </section>
  );
};
