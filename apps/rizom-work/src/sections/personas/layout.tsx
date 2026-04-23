import type { JSX } from "preact";
import { Section } from "@rizom/ui";
import {
  WORK_BODY_COPY,
  WORK_DISPLAY_QUOTE,
  WORK_SECTION_HEADLINE,
  WORK_SECTION_KICKER,
} from "../styles";
import type { PersonasContent } from "./schema";

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
          <span className={`${WORK_SECTION_KICKER} mb-4`}>{kicker}</span>
          <h2 className={`${WORK_SECTION_HEADLINE} max-w-[14ch]`}>
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
              <p
                className={`${WORK_DISPLAY_QUOTE} max-w-[500px] text-[clamp(24px,2.6vw,32px)] leading-[1.2]`}
              >
                {card.quote}
              </p>
              <p className={`${WORK_BODY_COPY} max-w-[500px]`}>{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
