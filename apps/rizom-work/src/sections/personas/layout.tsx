import type { JSX } from "preact";
import type { PersonasContent } from "./schema";
import { Section } from "@brains/site-rizom";

export const PersonasLayout = ({
  kicker,
  headline,
  cards,
}: PersonasContent): JSX.Element => {
  return (
    <Section id="personas" className="reveal py-section">
      <div className="mx-auto max-w-[1120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-12">
          <div className="mb-6 h-px w-12 bg-accent/70" />
          <span className="inline-flex items-center gap-3 font-label text-label-sm font-semibold uppercase tracking-[0.18em] text-accent mb-4">
            {kicker}
          </span>
          <h2 className="font-display text-[34px] tracking-[-1.2px] leading-[1.06] md:text-display-lg max-w-[14ch]">
            {headline}
          </h2>
        </div>

        <div className="mx-auto grid max-w-[1160px] grid-cols-1 gap-12 md:grid-cols-2 md:gap-[72px]">
          {cards.map((card, i) => (
            <div
              key={card.label}
              className={`reveal reveal-delay-${Math.min(i + 1, 3)} flex flex-col gap-[22px] border-t border-[var(--color-work-divider-strong)] pt-14`}
            >
              <div className="font-nav text-[11px] font-bold uppercase tracking-[2.5px] text-[var(--color-secondary)]">
                {card.label}
              </div>
              <p className="max-w-[500px] font-display text-[clamp(24px,2.6vw,32px)] italic leading-[1.2] tracking-[-0.6px] text-theme">
                {card.quote}
              </p>
              <p className="max-w-[500px] text-[17px] leading-[1.75] text-theme-muted">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
