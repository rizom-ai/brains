import type { JSX } from "preact";
import type { PersonasContent } from "./schema";
import { Section } from "../../components/Section";

export const PersonasLayout = ({
  kicker,
  headline,
  cards,
}: PersonasContent): JSX.Element => {
  return (
    <Section id="personas" className="personas-section reveal py-section">
      <div className="personas-inner max-w-[1120px] mx-auto">
        <div className="personas-head mb-10 md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[14ch]">
            {headline}
          </h2>
        </div>

        <div className="persona-grid grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {cards.map((card, i) => (
            <div
              key={card.label}
              className={`persona-card reveal reveal-delay-${Math.min(i + 1, 3)} rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8`}
            >
              <div className="persona-label font-nav text-heading-sm md:text-heading-md font-bold text-theme mb-4">
                {card.label}
              </div>
              <p className="persona-quote font-display italic text-[22px] md:text-[28px] tracking-[-0.8px] leading-[1.2] text-accent mb-4">
                {card.quote}
              </p>
              <p className="persona-body text-body-xs md:text-body-sm text-theme-muted">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
