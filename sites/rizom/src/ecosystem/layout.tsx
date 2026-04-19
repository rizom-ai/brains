import type { JSX } from "preact";
import { Badge, Divider, Section } from "../ui";
import type { EcosystemContent, EcosystemSuffix } from "./schema";

const BASE_CARD_CLASS =
  "reveal relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-[12px] md:rounded-[16px] border transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity";

const ACTIVE_EXTRAS =
  "border-[var(--color-card-panel-current-border)] bg-[image:var(--color-card-panel-current-bg)] before:!opacity-100 before:!h-[3px] before:bg-[linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)] hover:shadow-[0_16px_40px_-16px_var(--color-glow-panel-current)]";

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

export const EcosystemLayout = ({
  eyebrow,
  headline,
  cards,
}: EcosystemContent): JSX.Element => {
  return (
    <Section id="ecosystem" className="reveal pt-section pb-16 md:pb-24">
      <Divider className="mb-10 md:mb-14" />
      <div className="text-center mb-10 md:mb-14">
        <Badge className="mb-6">{eyebrow}</Badge>
        <h2 className="font-display text-display-md max-w-[880px] mx-auto">
          {headline}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card, i) => {
          // The active card (the one for the site you're currently on)
          // is identified by the literal "You are here" label. We tried
          // using linkHref === "#" but the structured-content formatter
          // treats `#` as a markdown heading marker and parses it as an
          // empty string.
          const isActive = card.linkLabel === "You are here";
          const isDisabled = card.linkHref.trim().length === 0;
          const extras = isActive ? ACTIVE_EXTRAS : STANDARD_EXTRAS;
          const accentEffects = isActive
            ? ""
            : `${ACCENT_GLOW[card.suffix]} ${ACCENT_BAR[card.suffix]}`;
          const linkClass = `mt-2 font-body text-[13px] md:text-[14px] font-medium ${isDisabled ? "text-theme-light opacity-70 cursor-default" : `transition-opacity hover:opacity-70 ${ACCENT_LINK[card.suffix]}`}`;
          return (
            <div
              key={card.suffix}
              className={`${BASE_CARD_CLASS} reveal-delay-${i + 1} ${extras} ${accentEffects}`}
            >
              <div className="mb-2 flex items-center gap-1 font-nav text-[16px]">
                <span className="font-bold">rizom</span>
                <span className="font-bold text-accent">.</span>
                <span className="text-theme-muted">{card.suffix}</span>
              </div>
              <div className="font-nav text-[18px] md:text-[22px] font-bold">
                {card.title}
              </div>
              <p className="text-[13px] md:text-[14px] leading-[1.7] text-theme-muted">
                {card.body}
              </p>
              {isDisabled ? (
                <span className={linkClass}>{card.linkLabel}</span>
              ) : (
                <a href={card.linkHref} className={linkClass}>
                  {card.linkLabel}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};
