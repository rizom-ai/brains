import type { JSX } from "preact";
import type { FoundationHeroContent } from "./schema";
import { Button, Section } from "@brains/rizom-ui";

export const FoundationHeroLayout = ({
  volumeLabel,
  yearLabel,
  metaLabel,
  headline,
  headlineTail,
  tagline,
  subtitle,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  scrollLabel,
  scrollHref,
  colophon,
}: FoundationHeroContent): JSX.Element => {
  return (
    <Section
      id="hero"
      className="foundation-hero flex min-h-[100dvh] items-center overflow-hidden text-center"
    >
      <div className="foundation-hero-inner relative z-[2] mx-auto max-w-[980px] pt-24 md:pt-28">
        <div className="foundation-hero-meta mx-auto mb-6 flex flex-wrap items-center justify-center gap-3 text-theme-light font-label text-label-sm font-semibold uppercase tracking-[0.18em] opacity-0 animate-hero-rise [animation-delay:0.1s]">
          <span>{volumeLabel}</span>
          <span className="text-accent">·</span>
          <span>{yearLabel}</span>
          <span className="text-accent">·</span>
          <span>{metaLabel}</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-glow-cta)]" />
        </div>
        <h1 className="foundation-hero-title font-display font-normal text-[38px] tracking-[-1.5px] leading-[1.04] md:text-display-xl mb-6 opacity-0 animate-hero-rise [animation-delay:0.2s]">
          {headline}
          <span className="foundation-hero-tail block mt-3 md:mt-4 text-[28px] md:text-display-sm text-theme-muted leading-[1.18]">
            {headlineTail}
          </span>
        </h1>
        <p className="foundation-hero-tagline mx-auto max-w-[760px] font-display text-[22px] md:text-display-xs tracking-[-0.6px] text-theme mb-5 opacity-0 animate-hero-rise [animation-delay:0.35s]">
          {tagline}
        </p>
        <p className="foundation-hero-subtitle mx-auto max-w-[720px] font-body text-body-md md:text-body-lg text-theme-muted mb-9 md:mb-10 opacity-0 animate-hero-rise [animation-delay:0.45s]">
          {subtitle}
        </p>
        <div className="foundation-hero-cta flex flex-col md:flex-row gap-3 md:gap-4 md:justify-center md:flex-wrap opacity-0 animate-hero-rise [animation-delay:0.6s]">
          <Button href={primaryCtaHref} variant="primary" block>
            {primaryCtaLabel}
          </Button>
          <Button href={secondaryCtaHref} variant="secondary" block>
            {secondaryCtaLabel}
          </Button>
        </div>
        <div className="foundation-hero-colophon mt-10 md:mt-12 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 font-label text-label-sm font-medium uppercase tracking-[0.14em] text-theme-light opacity-0 animate-hero-rise [animation-delay:0.75s]">
          {colophon.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
      <a className="scroll-cue" href={scrollHref} aria-label={scrollLabel}>
        <span>{scrollLabel}</span>
        <span className="scroll-cue-line"></span>
      </a>
    </Section>
  );
};
