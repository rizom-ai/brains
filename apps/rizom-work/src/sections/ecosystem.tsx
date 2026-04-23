import { Badge, Divider, Section } from "@rizom/ui";

export type EcosystemSuffix = "ai" | "foundation" | "work";

export interface EcosystemCard {
  suffix: EcosystemSuffix;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}

export interface EcosystemContent {
  eyebrow: string;
  headline: string;
  cards: EcosystemCard[];
}

const BASE_CARD_CLASS =
  "reveal relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-[12px] md:rounded-[16px] border transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 [border-color:var(--rizom-ecosystem-card-border)] [background-image:var(--rizom-ecosystem-card-bg)] hover:[box-shadow:var(--rizom-ecosystem-card-hover-shadow)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[var(--rizom-ecosystem-card-bar-height)] before:opacity-[var(--rizom-ecosystem-card-bar-opacity)] hover:before:opacity-100 before:transition-opacity before:[background-image:var(--rizom-ecosystem-card-bar)]";

const ACTIVE_THEME =
  "[--rizom-ecosystem-card-border:var(--color-card-panel-current-border)] [--rizom-ecosystem-card-bg:var(--color-card-panel-current-bg)] [--rizom-ecosystem-card-hover-shadow:0_16px_40px_-16px_var(--color-glow-panel-current)] [--rizom-ecosystem-card-bar-height:3px] [--rizom-ecosystem-card-bar-opacity:1] [--rizom-ecosystem-card-bar:linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]";

const STANDARD_THEME =
  "[--rizom-ecosystem-card-border:var(--color-card-panel-border)] [--rizom-ecosystem-card-bg:var(--color-card-panel-bg)] [--rizom-ecosystem-card-bar-height:2px] [--rizom-ecosystem-card-bar-opacity:0.6]";

const SUFFIX_THEME: Record<EcosystemSuffix, string> = {
  ai: "[--rizom-ecosystem-card-hover-shadow:0_16px_40px_-16px_var(--color-glow-panel-ai)] [--rizom-ecosystem-card-bar:linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]",
  foundation:
    "[--rizom-ecosystem-card-hover-shadow:0_16px_40px_-16px_var(--color-glow-panel-foundation)] [--rizom-ecosystem-card-bar:linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)]",
  work: "[--rizom-ecosystem-card-hover-shadow:0_16px_40px_-16px_var(--color-glow-panel-work)] [--rizom-ecosystem-card-bar:linear-gradient(90deg,transparent,var(--palette-amber-light)_30%,var(--color-secondary)_70%,transparent)]",
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
}: EcosystemContent) => {
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
          const isActive = card.linkLabel === "You are here";
          const isDisabled = card.linkHref.trim().length === 0;
          const themeClass = isActive
            ? ACTIVE_THEME
            : `${STANDARD_THEME} ${SUFFIX_THEME[card.suffix]}`;
          const linkClass = `mt-2 font-body text-[13px] md:text-[14px] font-medium ${isDisabled ? "text-theme-light opacity-70 cursor-default" : `transition-opacity hover:opacity-70 ${ACCENT_LINK[card.suffix]}`}`;
          return (
            <div
              key={card.suffix}
              className={`${BASE_CARD_CLASS} reveal-delay-${i + 1} ${themeClass}`}
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
