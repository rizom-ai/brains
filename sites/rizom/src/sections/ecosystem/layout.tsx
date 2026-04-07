import type { JSX } from "preact";
import type { EcosystemContent, EcosystemCard } from "./schema";
import { Section } from "../../components/Section";

const BASE_CARD_CLASS =
  "reveal relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity";

const ACTIVE_EXTRAS =
  "border-[var(--color-card-eco-ai-border)] bg-[var(--color-card-eco-ai-bg)] before:!opacity-100 before:!h-[3px] hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-ai)]";

const STANDARD_EXTRAS =
  "border-[var(--color-card-eco-border)] bg-[var(--color-card-eco-bg)]";

const ACCENT_GLOW: Record<EcosystemCard["accent"], string> = {
  amber: "hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-ai)]",
  secondary:
    "hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-foundation)]",
};

const ACCENT_BAR: Record<EcosystemCard["accent"], string> = {
  amber:
    "before:bg-[linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]",
  secondary:
    "before:bg-[linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)]",
};

const ACCENT_LINK: Record<EcosystemCard["accent"], string> = {
  amber: "text-accent",
  secondary: "text-secondary",
};

export const EcosystemLayout = ({ cards }: EcosystemContent): JSX.Element => {
  return (
    <Section id="ecosystem" className="reveal pt-section pb-16 md:pb-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card, i) => {
          const extras = card.active ? ACTIVE_EXTRAS : STANDARD_EXTRAS;
          return (
            <div
              key={card.suffix}
              className={`${BASE_CARD_CLASS} reveal-delay-${i + 1} ${extras} ${ACCENT_GLOW[card.accent]} ${ACCENT_BAR[card.accent]}`}
            >
              <div className="flex items-center gap-1 font-nav text-body-md mb-2">
                <span className="font-bold">rizom</span>
                <span className="font-bold text-accent">.</span>
                <span className="text-theme-muted">{card.suffix}</span>
              </div>
              <div className="font-nav text-heading-sm md:text-heading-lg font-bold">
                {card.title}
              </div>
              <p className="text-body-xs text-theme-muted">{card.body}</p>
              <a
                href={card.linkHref}
                className={`font-body text-label-md font-medium mt-2 transition-opacity hover:opacity-70 ${ACCENT_LINK[card.accent]}`}
              >
                {card.linkLabel}
              </a>
            </div>
          );
        })}
      </div>
    </Section>
  );
};
