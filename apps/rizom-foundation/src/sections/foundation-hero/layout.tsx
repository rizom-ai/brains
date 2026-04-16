import type { JSX } from "preact";
import type { FoundationHeroContent } from "./schema";
import { Button, Section } from "@brains/site-rizom";

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
      className="flex min-h-[100dvh] items-center overflow-hidden text-center"
    >
      <div className="relative z-[2] mx-auto max-w-[1040px] pt-[52px] md:pt-[60px]">
        <div className="mx-auto mb-8 inline-flex flex-wrap items-center justify-center gap-[10px] border-y border-[var(--color-foundation-meta-rule)] px-[18px] py-[10px] font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-theme-light opacity-0 animate-hero-rise [animation-delay:0.1s] md:mb-14 md:gap-3 md:px-6 md:py-[11px]">
          <span>{volumeLabel}</span>
          <span className="text-accent">·</span>
          <span>{yearLabel}</span>
          <span className="text-accent">·</span>
          <span>{metaLabel}</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--color-glow-cta)]" />
        </div>
        <h1 className="mb-6 font-display text-[clamp(56px,10.5vw,148px)] font-normal leading-[0.88] tracking-[-2.5px] opacity-0 animate-hero-rise [animation-delay:0.2s] md:tracking-[-5px]">
          {headline}
          <span className="mt-4 block text-[0.42em] leading-[1.2] tracking-[-1.5px] text-theme-muted italic md:mt-6 md:leading-[1.15]">
            {headlineTail}
          </span>
        </h1>
        <p className="mx-auto mb-7 max-w-[780px] font-display text-[clamp(20px,2.4vw,28px)] tracking-[-0.3px] text-theme italic leading-[1.4] opacity-0 animate-hero-rise [animation-delay:0.35s] md:mb-10">
          {tagline}
        </p>
        <p className="mx-auto mb-11 max-w-[560px] font-body text-[16px] leading-[1.7] text-theme-muted italic opacity-0 animate-hero-rise [animation-delay:0.45s]">
          {subtitle}
        </p>
        <div className="flex flex-col items-center gap-6 opacity-0 animate-hero-rise [animation-delay:0.6s] md:flex-row md:flex-wrap md:justify-center md:gap-9">
          <Button href={primaryCtaHref} variant="primary" block>
            {primaryCtaLabel}
          </Button>
          <Button href={secondaryCtaHref} variant="secondary" block>
            {secondaryCtaLabel}
          </Button>
        </div>
        <div className="mx-auto mt-10 flex max-w-[680px] flex-col items-center justify-center gap-[14px] border-t border-[var(--color-foundation-divider-soft)] pt-[18px] font-label text-label-sm font-medium uppercase tracking-[0.14em] text-theme-light opacity-0 animate-hero-rise [animation-delay:0.75s] md:mt-16 md:flex-row md:gap-8 md:pt-6">
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
