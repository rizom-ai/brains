import type { JSX } from "preact";
import type { PullQuoteContent } from "./schema";
import { Section } from "../../components/Section";

export const PullQuoteLayout = ({
  quote,
  attribution,
}: PullQuoteContent): JSX.Element => {
  return (
    <Section id="pull-quote" className="reveal py-section">
      <div className="max-w-[960px] mx-auto rounded-[24px] border border-white/8 bg-white/[0.02] px-6 py-10 md:px-10 md:py-14 text-center">
        <blockquote className="font-display text-[28px] tracking-[-1px] leading-[1.2] md:text-display-md text-theme">
          {quote}
        </blockquote>
        <div className="mt-6 font-body text-body-sm md:text-body-md text-theme-muted">
          {attribution}
        </div>
      </div>
    </Section>
  );
};
