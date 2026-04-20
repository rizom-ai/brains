import type { JSX } from "preact";
import { Button, Section } from "@brains/site-rizom";
import {
  FOUNDATION_OUTLINED_INDEX,
  FOUNDATION_SECTION_EYEBROW_ROW,
  FOUNDATION_SECTION_EYEBROW_RULE,
  FOUNDATION_SECTION_EYEBROW_TEXT,
  FOUNDATION_SECTION_HEADER,
  FOUNDATION_SECTION_HEADLINE,
  FOUNDATION_SECTION_SUBHEAD,
} from "../styles";
import type { ResearchContent } from "./schema";

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
        <div className={FOUNDATION_SECTION_HEADER}>
          <div className={FOUNDATION_SECTION_EYEBROW_ROW}>
            <span className={FOUNDATION_SECTION_EYEBROW_RULE} />
            <span className={FOUNDATION_SECTION_EYEBROW_TEXT}>{kicker}</span>
          </div>
          <h2 className={`${FOUNDATION_SECTION_HEADLINE} max-w-[12ch]`}>
            {headline}
          </h2>
          <p className={`${FOUNDATION_SECTION_SUBHEAD} max-w-[620px]`}>
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
              <div className={FOUNDATION_OUTLINED_INDEX}>{essay.num}</div>
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
