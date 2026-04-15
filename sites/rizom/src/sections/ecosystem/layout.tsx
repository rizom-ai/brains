import type { JSX } from "preact";
import { Section } from "@brains/rizom-ui";
import type { EcosystemContent, EcosystemSuffix } from "./schema";

const BASE_CARD_CLASS =
  "reveal relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity";

const ACTIVE_EXTRAS =
  "border-[var(--color-card-panel-ai-border)] bg-[image:var(--color-card-panel-ai-bg)] before:!opacity-100 before:!h-[3px] hover:shadow-[0_16px_40px_-16px_var(--color-glow-panel-ai)]";

const STANDARD_EXTRAS =
  "border-[var(--color-card-panel-border)] bg-[image:var(--color-card-panel-bg)]";

const ACCENT_GLOW: Record<EcosystemSuffix, string> = {
  ai: "hover:shadow-[0_16px_40px_-16px_var(--color-glow-panel-ai)]",
  foundation:
    "hover:shadow-[0_16px_40px_-16px_var(--color-glow-panel-foundation)]",
  work: "hover:shadow-[0_16px_40px_-16px_var(--color-glow-panel-work)]",
};

const ACCENT_BAR: Record<EcosystemSuffix, string> = {
  ai: "before:bg-[linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]",
  foundation:
    "before:bg-[linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)]",
  // Mock work card uses an amber-light → purple-light blend
  work: "before:bg-[linear-gradient(90deg,transparent,var(--palette-amber-light)_30%,var(--color-secondary)_70%,transparent)]",
};

const ACCENT_LINK: Record<EcosystemSuffix, string> = {
  ai: "text-accent",
  foundation: "text-secondary",
  work: "text-secondary",
};

export const EcosystemLayout = ({ cards }: EcosystemContent): JSX.Element => {
  return (
    <Section id="ecosystem" className="reveal pt-section pb-16 md:pb-24">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card, i) => {
          // The active card (the one for the site you're currently on)
          // is identified by the literal "You are here" label. We tried
          // using linkHref === "#" but the structured-content formatter
          // treats `#` as a markdown heading marker and parses it as an
          // empty string.
          const isActive = card.linkLabel === "You are here";
          const extras = isActive ? ACTIVE_EXTRAS : STANDARD_EXTRAS;
          return (
            <div
              key={card.suffix}
              className={`${BASE_CARD_CLASS} reveal-delay-${i + 1} ${extras} ${ACCENT_GLOW[card.suffix]} ${ACCENT_BAR[card.suffix]}`}
            >
              <div className="flex items-center gap-1 font-nav text-base mb-2">
                <span className="font-bold">rizom</span>
                <span className="font-bold text-accent">.</span>
                <span className="text-theme-muted">{card.suffix}</span>
              </div>
              <div className="font-nav text-heading-lg font-bold">
                {card.title}
              </div>
              <p className="text-body-xs text-theme-muted">{card.body}</p>
              <a
                href={card.linkHref}
                className={`font-body text-body-xs font-medium mt-2 transition-opacity hover:opacity-70 ${ACCENT_LINK[card.suffix]}`}
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
