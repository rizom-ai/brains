import type { JSX } from "preact";
import type { ProofContent } from "./schema";
import { Section } from "@brains/site-rizom";

export const ProofLayout = ({
  kicker,
  headline,
  quote,
  attribution,
  partnersLabel,
  partners,
}: ProofContent): JSX.Element => {
  return (
    <Section id="proof" className="reveal py-section">
      <div className="mx-auto max-w-[1120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[12ch]">
            {headline}
          </h2>
        </div>

        <blockquote className="relative mx-auto mb-14 max-w-[720px] bg-transparent px-0 py-8 text-left md:mb-24 md:px-10 md:py-10">
          <p className="relative mb-7 max-w-[24ch] pl-0 font-display text-[clamp(24px,3vw,38px)] italic leading-[1.28] tracking-[-0.6px] text-theme md:pl-14">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-7 -left-[10px] font-display text-[112px] leading-none text-accent/35 md:-top-10 md:-left-[6px] md:text-[180px]"
            >
              “
            </span>
            {quote}
          </p>
          <footer className="mt-5 pl-0 text-[12px] font-semibold uppercase tracking-[1.8px] text-theme-muted md:pl-14">
            {attribution}
          </footer>
        </blockquote>

        <div className="mt-8 md:mt-10 border-t border-white/10 pt-6 md:pt-8">
          <div className="mb-4 font-label text-[10px] uppercase tracking-[2.5px] text-theme-light">
            {partnersLabel}
          </div>
          <div className="flex flex-wrap justify-center gap-12 text-body-sm text-theme-muted md:text-body-md">
            {partners.map((partner) => (
              <span
                key={partner}
                className="font-display text-[20px] italic text-theme-muted transition-colors hover:text-accent"
              >
                {partner}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
};
