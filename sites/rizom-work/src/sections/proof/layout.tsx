import type { JSX } from "preact";
import type { ProofContent } from "./schema";
import { Section } from "@brains/rizom-ui";

export const ProofLayout = ({
  kicker,
  headline,
  quote,
  attribution,
  partnersLabel,
  partners,
}: ProofContent): JSX.Element => {
  return (
    <Section id="proof" className="proof-section reveal py-section">
      <div className="proof-inner max-w-[1120px] mx-auto">
        <div className="proof-head mb-10 md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[12ch]">
            {headline}
          </h2>
        </div>

        <blockquote className="proof-testimonial rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-8 md:px-10 md:py-10">
          <p className="proof-quote font-display text-[26px] leading-[1.22] tracking-[-0.8px] md:text-[34px] md:tracking-[-1.1px] text-theme max-w-[24ch]">
            {quote}
          </p>
          <footer className="proof-attribution mt-5 text-body-xs md:text-body-sm text-theme-muted">
            {attribution}
          </footer>
        </blockquote>

        <div className="mt-8 md:mt-10 border-t border-white/10 pt-6 md:pt-8">
          <div className="proof-partners-label font-label text-label-sm uppercase tracking-[0.18em] text-theme-light mb-4">
            {partnersLabel}
          </div>
          <div className="proof-partners flex flex-wrap gap-x-6 gap-y-3 text-body-sm md:text-body-md text-theme-muted">
            {partners.map((partner) => (
              <span key={partner} className="proof-partner">
                {partner}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
};
