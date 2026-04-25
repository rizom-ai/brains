import type { JSX } from "preact";
import { Section } from "@rizom/ui";
import {
  FOUNDATION_SECTION_EYEBROW_ROW,
  FOUNDATION_SECTION_EYEBROW_RULE,
  FOUNDATION_SECTION_EYEBROW_TEXT,
  FOUNDATION_SECTION_HEADER,
  FOUNDATION_SECTION_HEADLINE,
} from "../styles";
interface SupportCard {
  tone: "amber" | "purple";
  label: string;
  headline: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}

interface SupportContent {
  kicker: string;
  headline: string;
  cards: SupportCard[];
}

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
    <Section id="support" className="reveal py-section">
      <div className="mx-auto max-w-[1120px]">
        <div className={FOUNDATION_SECTION_HEADER}>
          <div className={FOUNDATION_SECTION_EYEBROW_ROW}>
            <span className={FOUNDATION_SECTION_EYEBROW_RULE} />
            <span className={FOUNDATION_SECTION_EYEBROW_TEXT}>{kicker}</span>
          </div>
          <h2 className={`${FOUNDATION_SECTION_HEADLINE} max-w-[14ch]`}>
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
