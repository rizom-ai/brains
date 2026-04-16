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
    <Section id="workshop" className="workshop-section reveal py-section">
      <div className="workshop-inner max-w-[1120px] mx-auto">
        <div className="workshop-head mb-10 md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[16ch]">
            {headline}
          </h2>
          <p className="workshop-intro mt-5 text-body-sm md:text-body-md text-theme-muted max-w-[720px]">
            {intro}
          </p>
        </div>

        <div className="workshop-steps-grid grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {steps.map((step, i) => (
            <div
              key={step.num + step.title}
              className={`workshop-step reveal reveal-delay-${i + 1}`}
            >
              <div className="mb-5 flex items-center gap-4">
                <span className="workshop-step-num font-display text-[42px] md:text-[56px] leading-none tracking-[-1.5px] text-transparent [-webkit-text-stroke:1.2px_var(--color-accent)]">
                  {step.num}
                </span>
                <div className="flex-1">
                  <div className="h-px bg-white/12 mb-2" />
                  <div className="workshop-step-label font-label text-label-sm uppercase tracking-[0.18em] text-theme-light">
                    {step.label}
                  </div>
                </div>
              </div>
              <h3 className="workshop-step-title font-display text-[26px] tracking-[-0.7px] leading-[1.15] text-theme">
                {step.title}
              </h3>
              <p className="workshop-step-body mt-3 text-body-xs md:text-body-sm text-theme-muted">
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
