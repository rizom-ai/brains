import type { JSX } from "preact";
import { Button, Section } from "@rizom/ui";
import {
  WORK_OUTLINED_STEP_NUMBER,
  WORK_SECTION_HEADLINE,
  WORK_SECTION_KICKER,
} from "../styles";
import type { WorkshopContent } from "./schema";

export const WorkshopLayout = ({
  kicker,
  headline,
  intro,
  steps,
  ctaLabel,
  ctaHref,
}: WorkshopContent): JSX.Element => {
  return (
    <Section id="workshop" className="reveal py-section">
      <div className="mx-auto max-w-[1120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className={`${WORK_SECTION_KICKER} mb-4`}>{kicker}</span>
          <h2 className={`${WORK_SECTION_HEADLINE} max-w-[16ch]`}>
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
                <span className={WORK_OUTLINED_STEP_NUMBER}>{step.num}</span>
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
