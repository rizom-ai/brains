import type { JSX } from "preact";
import type { SupportContent } from "./schema";
import { Section } from "@brains/rizom-ui";

const CARD_BASE =
  "flex flex-col items-start gap-5 rounded-2xl border p-8 md:p-10";

const CARD_BY_TONE = {
  amber: `${CARD_BASE} bg-[image:var(--color-card-rover-bg)] border-[var(--color-card-rover-border)]`,
  purple: `${CARD_BASE} bg-[image:var(--color-card-relay-bg)] border-[var(--color-card-relay-border)]`,
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
    <Section id="support" className="foundation-support reveal py-section">
      <div className="foundation-support-inner max-w-[1120px] mx-auto">
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

        <div className="foundation-support-grid grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {cards.map((card, i) => (
            <div
              key={card.label + card.headline}
              className={`foundation-support-card foundation-support-card-${card.tone} reveal reveal-delay-${i + 1} ${CARD_BY_TONE[card.tone]}`}
            >
              <span
                className={`foundation-support-label font-nav text-[18px] font-bold ${TEXT_BY_TONE[card.tone]}`}
              >
                {card.label}
              </span>
              <h3 className="foundation-support-headline font-display text-[28px] md:text-display-sm tracking-[-0.6px] leading-[1.15] text-theme">
                {card.headline}
              </h3>
              <p className="foundation-support-body text-body-xs md:text-body-sm text-theme-muted">
                {card.body}
              </p>
              <a
                href={card.linkHref}
                className={`foundation-support-link font-body text-body-sm font-medium ${TEXT_BY_TONE[card.tone]} hover:opacity-75`}
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
