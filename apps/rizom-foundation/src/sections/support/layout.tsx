import type { JSX } from "preact";
import type { SupportContent } from "./schema";
import { Section } from "@brains/site-rizom";

const CARD_BASE =
  "flex flex-col items-start gap-5 rounded-2xl border px-6 py-8 md:p-10 transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-1";

const CARD_BY_TONE = {
  amber: `${CARD_BASE} bg-[image:var(--color-card-rover-bg)] border-[var(--color-card-rover-border)] hover:border-[var(--color-foundation-support-amber-hover-border)] hover:shadow-[0_20px_60px_-20px_var(--color-foundation-support-amber-hover-shadow)]`,
  purple: `${CARD_BASE} bg-[image:var(--color-card-relay-bg)] border-[var(--color-card-relay-border)] hover:border-[var(--color-foundation-support-purple-hover-border)] hover:shadow-[0_20px_60px_-20px_var(--color-foundation-support-purple-hover-shadow)]`,
};

const TEXT_BY_TONE = {
  amber: "text-accent",
  purple: "text-secondary",
};

export const SupportLayout = ({
  kicker,
  headline,
  cards,
}: SupportContent): JSX.Element => {
  return (
    <Section id="support" className="reveal py-[88px] md:py-[120px]">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 md:mb-12">
          <div className="flex items-center gap-3 text-accent mb-4">
            <span className="block w-8 h-px bg-accent/80" />
            <span className="font-label text-label-md font-semibold tracking-[0.16em] uppercase">
              {kicker}
            </span>
          </div>
          <h2 className="font-display text-[32px] tracking-[-1px] leading-[1.08] md:text-display-md text-theme max-w-[14ch]">
            {headline}
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {cards.map((card, i) => (
            <div
              key={card.label + card.headline}
              className={`reveal reveal-delay-${i + 1} ${CARD_BY_TONE[card.tone]}`}
            >
              <span
                className={`font-nav text-[18px] font-bold ${TEXT_BY_TONE[card.tone]}`}
              >
                {card.label}
              </span>
              <h3 className="font-display text-[clamp(26px,3vw,36px)] leading-[1.2] tracking-[-0.5px] text-theme">
                {card.headline}
              </h3>
              <p className="text-body-xs md:text-body-sm text-theme-muted">
                {card.body}
              </p>
              <a
                href={card.linkHref}
                className={`mt-2 font-body text-body-sm font-medium ${TEXT_BY_TONE[card.tone]} hover:opacity-75`}
              >
                {card.linkLabel}
              </a>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
