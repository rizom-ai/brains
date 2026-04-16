import type { JSX } from "preact";
import type { PullQuoteContent } from "./schema";
import { Section } from "@brains/site-rizom";

export const PullQuoteLayout = ({
  quote,
  attribution,
}: PullQuoteContent): JSX.Element => {
  return (
    <Section id="pull-quote" className="reveal pt-20 pb-10 md:pt-20 md:pb-10">
      <div className="max-w-[880px] mx-auto px-4 md:px-10 text-center">
        <div className="mx-auto mb-8 h-px w-12 bg-[var(--color-divider)]" />
        <blockquote className="font-display font-light text-[26px] tracking-[-0.8px] leading-[1.25] md:text-[42px] text-theme">
          {quote}
        </blockquote>
        <div className="mt-6 font-label text-label-sm font-medium uppercase tracking-[0.16em] text-theme-light">
          {attribution}
        </div>
        <div className="mx-auto mt-8 h-px w-12 bg-[var(--color-divider)]" />
      </div>
    </Section>
  );
};
