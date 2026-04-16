import type { JSX } from "preact";
import type { WorkshopContent } from "./schema";
import { Button, Section } from "@brains/site-rizom";

export const WorkshopLayout = ({
  kicker,
  headline,
  intro,
  steps,
  ctaLabel,
  ctaHref,
}: WorkshopContent): JSX.Element => {
  return (
    <Section id="workshop" className="reveal py-[88px] md:py-[128px]">
      <div className="mx-auto max-w-[1120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[16ch]">
            {headline}
          </h2>
          <p className="mx-auto mt-5 max-w-[640px] text-[18px] leading-[1.72] text-theme-muted">
            {intro}
          </p>
        </div>

        <div className="mx-auto flex max-w-[960px] flex-col">
          {steps.map((step, i) => (
            <div
              key={step.num + step.title}
              className={`reveal reveal-delay-${i + 1} grid items-start gap-[18px] border-t border-[var(--color-work-divider-soft)] py-8 md:grid-cols-[240px_1fr] md:gap-16 md:py-14 ${i === steps.length - 1 ? "border-b" : ""}`}
            >
              <div className="mb-5 flex items-center gap-4">
                <span className="font-display text-[42px] leading-none tracking-[-1.5px] text-transparent [-webkit-text-stroke:1.2px_var(--color-accent)] md:text-[56px]">
                  {step.num}
                </span>
                <div className="flex-1">
                  <div className="h-px bg-white/12 mb-2" />
                  <div className="font-label text-label-sm uppercase tracking-[0.18em] text-theme-light">
                    {step.label}
                  </div>
                </div>
              </div>
              <h3 className="font-display text-[26px] leading-[1.15] tracking-[-0.7px] text-theme">
                {step.title}
              </h3>
              <p className="mt-3 text-body-xs text-theme-muted md:text-body-sm">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 md:mt-12">
          <Button href={ctaHref} variant="primary">
            {ctaLabel}
          </Button>
        </div>
      </div>
    </Section>
  );
};
