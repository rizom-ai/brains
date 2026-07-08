import type { JSX } from "preact";
import { Button, Section, renderHighlightedText } from "@brains/site-rizom";

const HIGHLIGHT_CLS = "italic text-accent font-normal";

export interface CtaLink {
  label: string;
  href: string;
}

export interface HomeHeroContent {
  kicker: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export interface WorkHeroContent {
  eyebrow: string;
  provenance: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

export interface FoundationHeroContent {
  volume: string;
  meta: string;
  headline: string;
  standfirst: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}

function CtaRow({
  primaryCta,
  secondaryCta,
}: {
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
}): JSX.Element {
  return (
    <div className="mt-10 flex flex-col gap-3 sm:flex-row">
      <Button href={primaryCta.href} size="lg" variant="primary-strong">
        {primaryCta.label}
      </Button>
      <Button href={secondaryCta.href} size="lg" variant="secondary">
        {secondaryCta.label}
      </Button>
    </div>
  );
}

export function HomeHeroSection({
  kicker,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: HomeHeroContent): JSX.Element {
  return (
    <Section
      id="hero"
      className="flex min-h-[92vh] items-center pt-[152px] pb-20 md:pt-[190px]"
    >
      <div className="relative z-[2] max-w-[980px]">
        <p className="font-label text-label-sm uppercase tracking-[0.28em] text-accent">
          {kicker}
        </p>
        <h1 className="mt-7 font-display text-display-lg text-theme">
          {renderHighlightedText(headline, HIGHLIGHT_CLS)}
        </h1>
        <p className="mt-7 max-w-[720px] font-body text-body-lg text-theme-muted">
          {standfirst}
        </p>
        <CtaRow primaryCta={primaryCta} secondaryCta={secondaryCta} />
      </div>
    </Section>
  );
}

export function WorkHeroSection({
  eyebrow,
  provenance,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: WorkHeroContent): JSX.Element {
  return (
    <Section
      id="work-hero"
      className="min-h-[78vh] pt-[150px] pb-section md:pt-[190px]"
    >
      <div className="max-w-[920px]">
        <p className="flex items-baseline gap-4 font-label text-label-sm uppercase tracking-[0.28em] text-accent">
          <span>{eyebrow}</span>
          <span className="normal-case tracking-normal text-theme-light">
            {provenance}
          </span>
        </p>
        <h1 className="mt-6 font-display text-display-lg text-theme">
          {renderHighlightedText(headline, HIGHLIGHT_CLS)}
        </h1>
        <p className="mt-7 max-w-[720px] font-body text-body-lg text-theme-muted">
          {standfirst}
        </p>
        <CtaRow primaryCta={primaryCta} secondaryCta={secondaryCta} />
      </div>
    </Section>
  );
}

export function FoundationHeroSection({
  volume,
  meta,
  headline,
  standfirst,
  primaryCta,
  secondaryCta,
}: FoundationHeroContent): JSX.Element {
  return (
    <Section
      id="foundation-hero"
      className="min-h-[78vh] pt-[150px] pb-section md:pt-[190px]"
    >
      <div className="max-w-[920px]">
        <p className="flex items-baseline gap-4 font-label text-label-sm uppercase tracking-[0.28em] text-accent">
          <span>{volume}</span>
          <span className="normal-case tracking-normal text-theme-light">
            {meta}
          </span>
        </p>
        <h1 className="mt-6 font-display text-display-lg text-theme">
          {renderHighlightedText(headline, HIGHLIGHT_CLS)}
        </h1>
        <p className="mt-7 max-w-[720px] font-body text-body-lg text-theme-muted">
          {standfirst}
        </p>
        <CtaRow primaryCta={primaryCta} secondaryCta={secondaryCta} />
      </div>
    </Section>
  );
}
