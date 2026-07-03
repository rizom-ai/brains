import type { JSX } from "preact";
import { Section, renderHighlightedText } from "@brains/site-rizom";
import { WorkButton } from "../../link-targets";
import { WORK_KICKER, WORK_RULE } from "../styles";
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
    <Section id="workshop" className="reveal py-[128px] max-[768px]:py-20">
      <div
        className={`${WORK_RULE} mb-16 -mt-16 max-[768px]:-mt-10 max-[768px]:mb-12`}
      />

      <div className="mx-auto mb-24 max-w-[720px] text-center max-[768px]:mb-14">
        <span className={`${WORK_KICKER} mb-3`}>{kicker}</span>
        <h2 className="mt-3 mb-7 font-display text-[clamp(36px,5vw,68px)] font-[520] leading-[1.02] tracking-[-1.6px] text-theme max-[768px]:text-[34px] max-[768px]:tracking-[-1.1px]">
          {renderHighlightedText(headline, "")}
        </h2>
        <p className="mx-auto max-w-[640px] font-body text-[18px] leading-[1.72] text-theme-muted max-[768px]:text-[16px] max-[768px]:leading-[1.68]">
          {intro}
        </p>
      </div>

      <div className="mx-auto flex max-w-[960px] flex-col">
        {steps.map((step, i) => (
          <div
            key={step.num + step.title}
            className={`reveal reveal-delay-${i + 1} grid grid-cols-[240px_1fr] items-start gap-16 border-t border-[var(--color-work-divider-soft)] py-14 max-[1100px]:grid-cols-[200px_1fr] max-[1100px]:gap-10 max-[768px]:grid-cols-1 max-[768px]:gap-5 max-[768px]:py-10 ${i === steps.length - 1 ? "border-b" : ""}`}
          >
            <div className="flex items-baseline gap-[18px] pt-1.5 max-[768px]:gap-3.5">
              <span className="font-display text-[68px] font-light leading-[0.82] tracking-[-3px] text-accent max-[1100px]:text-[56px] max-[768px]:text-[48px] max-[768px]:tracking-[-2px]">
                {step.num}
              </span>
              <span className="mb-3.5 inline-block h-[1.5px] w-16 bg-accent/55 max-[768px]:w-12" />
              <span className="font-label text-[11px] font-semibold uppercase tracking-[2.5px] text-theme-muted">
                {step.label}
              </span>
            </div>
            <div>
              <h3 className="mb-4 font-display text-[28px] font-[520] leading-[1.2] tracking-[-0.6px] text-theme max-[768px]:text-[22px]">
                {step.title}
              </h3>
              <p className="max-w-[560px] font-body text-[17px] leading-[1.72] text-theme-muted max-[768px]:text-[15px] max-[768px]:leading-[1.68]">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[72px] text-center max-[768px]:mt-12 max-[768px]:[&_.rizom-btn]:w-full max-[768px]:[&_.rizom-btn]:justify-center">
        <WorkButton href={ctaHref} variant="primary">
          {ctaLabel}
        </WorkButton>
      </div>
    </Section>
  );
};
