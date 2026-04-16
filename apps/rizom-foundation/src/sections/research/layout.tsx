import type { JSX } from "preact";
import type { ResearchContent } from "./schema";
import { Button, Section } from "@brains/site-rizom";

export const ResearchLayout = ({
  kicker,
  headline,
  subhead,
  essays,
  ctaLabel,
  ctaHref,
}: ResearchContent): JSX.Element => {
  return (
    <Section
      id="research"
      className="reveal px-0 py-[88px] md:pt-20 md:pb-[120px]"
    >
      <div className="mx-auto max-w-[960px]">
        <div className="mb-10 md:mb-12">
          <div className="flex items-center gap-3 text-accent mb-4">
            <span className="block w-8 h-px bg-accent/80" />
            <span className="font-label text-label-md font-semibold tracking-[0.16em] uppercase">
              {kicker}
            </span>
          </div>
          <h2 className="font-display text-[32px] tracking-[-1px] leading-[1.08] md:text-display-md text-theme max-w-[12ch]">
            {headline}
          </h2>
          <p className="mt-4 text-body-sm md:text-body-md text-theme-muted max-w-[620px]">
            {subhead}
          </p>
        </div>

        <div className="flex flex-col">
          {essays.map((essay, i) => (
            <a
              key={essay.num + essay.title}
              href={essay.href}
              className={`reveal reveal-delay-${Math.min(i + 1, 3)} group grid grid-cols-[80px_1fr_auto] items-start gap-6 border-t border-[var(--color-foundation-divider-soft)] py-8 transition-all hover:border-accent/40 hover:pl-3 md:grid-cols-[110px_1fr_36px] md:gap-8 md:py-11 md:hover:pl-4`}
            >
              <div className="font-display text-[38px] md:text-[54px] leading-none tracking-[-1.5px] text-transparent [-webkit-text-stroke:1.2px_var(--color-accent)]">
                {essay.num}
              </div>
              <div>
                <div className="font-label text-label-sm font-semibold tracking-[0.12em] uppercase text-theme-light mb-2">
                  {essay.series}
                </div>
                <h3 className="font-display text-[24px] md:text-[34px] tracking-[-1px] leading-[1.05] text-theme">
                  {essay.title}
                </h3>
                <p className="mt-3 text-body-xs md:text-body-sm text-theme-muted max-w-[620px]">
                  {essay.teaser}
                </p>
              </div>
              <div className="pt-1 md:pt-3 font-display text-[28px] md:text-[34px] text-accent transition-transform group-hover:translate-x-1">
                →
              </div>
            </a>
          ))}
          <div className="border-t border-white/8 pt-8 md:pt-10">
            <Button href={ctaHref} variant="secondary">
              {ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
};
